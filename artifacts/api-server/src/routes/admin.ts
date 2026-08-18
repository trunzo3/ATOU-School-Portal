import { Router, type IRouter, type Response } from "express";
import { asc, eq } from "drizzle-orm";
import {
  db,
  adminUsersTable,
  appSettingsTable,
  contactsTable,
  infoPagesTable,
  schoolsTable,
} from "@workspace/db";
import {
  AdminLoginBody,
  SetSchoolLockBody,
  UpdateEmailTemplateBody,
  CreateAdminUserBody,
  UpdateAdminUserBody,
  CreatePageBody,
  UpdatePageBody,
  UpdateSettingsBody,
} from "@workspace/api-zod";
import {
  PAM_EMAIL,
  clearSessionCookie,
  hashPassword,
  requireAdmin,
  setSessionCookie,
  verifyPassword,
  type AdminRequest,
} from "../lib/auth";
import { schoolLink } from "../lib/appUrl";
import { getQuestionStates, missingCount, normalizeEmail } from "../lib/answers";

const router: IRouter = Router();

function idParam(req: { params: Record<string, unknown> }): number {
  const raw = req.params["id"];
  return parseInt(Array.isArray(raw) ? String(raw[0]) : String(raw), 10);
}

function adminOut(a: { id: number; email: string; createdAt: Date }) {
  return { id: a.id, email: a.email, createdAt: a.createdAt.toISOString() };
}

function pageOut(p: {
  id: number;
  title: string;
  slug: string;
  body: string;
  sortOrder: number;
  published: boolean;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    body: p.body,
    sortOrder: p.sortOrder,
    published: p.published,
    updatedAt: p.updatedAt.toISOString(),
  };
}

// --- auth ---

router.post("/admin/login", async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, email));
  if (!admin || !verifyPassword(parsed.data.password, admin.passwordHash)) {
    res.status(401).json({ error: "That email and password don't match." });
    return;
  }
  setSessionCookie(res, admin.id, admin.email);
  res.json(adminOut(admin));
});

// Temporary development-only login. Remove before going live.
router.post("/admin/dev-login", async (_req, res): Promise<void> => {
  const [pam] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, PAM_EMAIL));
  if (!pam) {
    res.status(500).json({ error: "Pam's account is missing." });
    return;
  }
  setSessionCookie(res, pam.id, pam.email);
  res.json(adminOut(pam));
});

router.post("/admin/logout", async (_req, res): Promise<void> => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/admin/me", requireAdmin, async (req: AdminRequest, res): Promise<void> => {
  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.id, req.admin!.id));
  if (!admin) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  res.json(adminOut(admin));
});

// --- schools grid ---

router.get("/admin/summary", requireAdmin, async (_req, res): Promise<void> => {
  const schools = await db.select().from(schoolsTable);
  let complete = 0;
  let partial = 0;
  let untouched = 0;
  for (const school of schools) {
    const states = await getQuestionStates(school.id);
    const missing = missingCount(states);
    const answeredAny = states.some((s) => s.answered);
    if (missing === 0) complete += 1;
    else if (answeredAny) partial += 1;
    else untouched += 1;
  }
  res.json({
    totalSchools: schools.length,
    complete,
    partial,
    untouched,
    locked: schools.filter((s) => s.locked).length,
  });
});

router.get("/admin/schools", requireAdmin, async (_req, res): Promise<void> => {
  const schools = await db.select().from(schoolsTable).orderBy(asc(schoolsTable.workshopDate));
  const rows = [];
  for (const school of schools) {
    const states = await getQuestionStates(school.id);
    rows.push({
      id: school.id,
      name: school.name,
      code: school.code,
      link: schoolLink(school.code),
      workshopDate: school.workshopDate,
      locked: school.locked,
      questionStates: states,
      missingCount: missingCount(states),
    });
  }
  res.json(rows);
});

async function schoolDetail(schoolId: number, res: Response): Promise<void> {
  const [school] = await db.select().from(schoolsTable).where(eq(schoolsTable.id, schoolId));
  if (!school) {
    res.status(404).json({ error: "School not found." });
    return;
  }
  const contacts = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.schoolId, school.id))
    .orderBy(asc(contactsTable.id));
  res.json({
    id: school.id,
    name: school.name,
    code: school.code,
    link: schoolLink(school.code),
    workshopDate: school.workshopDate,
    locked: school.locked,
    contacts: contacts.map((c) => ({ id: c.id, email: c.email, name: c.name })),
  });
}

router.get("/admin/schools/:id", requireAdmin, async (req, res): Promise<void> => {
  await schoolDetail(idParam(req), res);
});

router.patch("/admin/schools/:id/lock", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SetSchoolLockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "locked must be true or false." });
    return;
  }
  const id = idParam(req);
  await db.update(schoolsTable).set({ locked: parsed.data.locked }).where(eq(schoolsTable.id, id));
  await schoolDetail(id, res);
});

// --- email sending prep ---

router.get("/admin/due", requireAdmin, async (_req, res): Promise<void> => {
  // Due = workshop date about two months out (45-75 day window around 60 days).
  const schools = await db.select().from(schoolsTable).orderBy(asc(schoolsTable.workshopDate));
  const now = new Date();
  const out = [];
  for (const school of schools) {
    if (!school.workshopDate) continue;
    const workshop = new Date(`${school.workshopDate}T12:00:00-08:00`);
    const daysOut = Math.round((workshop.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOut < 45 || daysOut > 75) continue;
    const contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.schoolId, school.id));
    const dateText = workshop.toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    out.push({
      schoolId: school.id,
      name: school.name,
      workshopDate: school.workshopDate,
      contactEmails: contacts.map((c) => c.email),
      link: schoolLink(school.code),
      subject: `Logistics needed for A Touch of Understanding Workshop - ${school.name} - ${dateText}`,
    });
  }
  res.json(out);
});

const DEFAULT_TEMPLATE = `[Pam — this template needs your wording before it's used. Write the email in your own voice; the school's private link will be inserted where {{link}} appears below.]

Hello,

...

Please fill in your workshop logistics here: {{link}}

Thank you,
Pam
A Touch of Understanding`;

router.get("/admin/template", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "email_template"));
  res.json({
    body: row ? row.value : DEFAULT_TEMPLATE,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  });
});

router.put("/admin/template", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateEmailTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Template body is required." });
    return;
  }
  const [row] = await db
    .insert(appSettingsTable)
    .values({ key: "email_template", value: parsed.data.body })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: parsed.data.body, updatedAt: new Date() },
    })
    .returning();
  res.json({ body: row!.value, updatedAt: row!.updatedAt.toISOString() });
});

// --- admin accounts ---

router.get("/admin/admins", requireAdmin, async (_req, res): Promise<void> => {
  const admins = await db.select().from(adminUsersTable).orderBy(asc(adminUsersTable.id));
  res.json(admins.map(adminOut));
});

router.post("/admin/admins", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and a password of at least 8 characters are required." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const existing = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "An admin with that email already exists." });
    return;
  }
  const [admin] = await db
    .insert(adminUsersTable)
    .values({ email, passwordHash: hashPassword(parsed.data.password) })
    .returning();
  res.status(201).json(adminOut(admin!));
});

router.patch("/admin/admins/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  const [admin] = await db
    .update(adminUsersTable)
    .set({ passwordHash: hashPassword(parsed.data.password) })
    .where(eq(adminUsersTable.id, idParam(req)))
    .returning();
  if (!admin) {
    res.status(404).json({ error: "Admin not found." });
    return;
  }
  res.json(adminOut(admin));
});

router.delete("/admin/admins/:id", requireAdmin, async (req, res): Promise<void> => {
  const admins = await db.select().from(adminUsersTable);
  if (admins.length <= 1) {
    res.status(400).json({ error: "You can't remove the last admin account." });
    return;
  }
  const id = idParam(req);
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
  res.json({ ok: true });
});

// --- info pages ---

router.get("/admin/pages", requireAdmin, async (_req, res): Promise<void> => {
  const pages = await db
    .select()
    .from(infoPagesTable)
    .orderBy(asc(infoPagesTable.sortOrder), asc(infoPagesTable.id));
  res.json(pages.map(pageOut));
});

router.post("/admin/pages", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Title, web address, and body are required." });
    return;
  }
  const [page] = await db
    .insert(infoPagesTable)
    .values({
      title: parsed.data.title,
      slug: parsed.data.slug,
      body: parsed.data.body,
      sortOrder: parsed.data.sortOrder ?? 0,
      published: parsed.data.published ?? false,
    })
    .returning();
  res.status(201).json(pageOut(page!));
});

router.patch("/admin/pages/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdatePageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid page update." });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates["title"] = parsed.data.title;
  if (parsed.data.slug !== undefined) updates["slug"] = parsed.data.slug;
  if (parsed.data.body !== undefined) updates["body"] = parsed.data.body;
  if (parsed.data.sortOrder !== undefined) updates["sortOrder"] = parsed.data.sortOrder;
  if (parsed.data.published !== undefined) updates["published"] = parsed.data.published;
  const [page] = await db
    .update(infoPagesTable)
    .set(updates)
    .where(eq(infoPagesTable.id, idParam(req)))
    .returning();
  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  res.json(pageOut(page));
});

router.delete("/admin/pages/:id", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(infoPagesTable).where(eq(infoPagesTable.id, idParam(req)));
  res.json({ ok: true });
});

router.get("/admin/pages/export", requireAdmin, async (_req, res): Promise<void> => {
  const pages = await db
    .select()
    .from(infoPagesTable)
    .orderBy(asc(infoPagesTable.sortOrder), asc(infoPagesTable.id));
  res.json({ exportedAt: new Date().toISOString(), pages: pages.map(pageOut) });
});

// --- Airtable settings (stored, connection stays OFF) ---

router.get("/admin/settings", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "airtable"));
  let cfg = { apiKey: "", baseId: "", tableId: "" };
  if (row) {
    try {
      cfg = { ...cfg, ...(JSON.parse(row.value) as Partial<typeof cfg>) };
    } catch {
      // ignore malformed settings
    }
  }
  res.json({
    apiKeySet: cfg.apiKey.length > 0,
    baseId: cfg.baseId,
    tableId: cfg.tableId,
    enabled: false, // connection stays off in this build
  });
});

router.put("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings." });
    return;
  }
  await db
    .insert(appSettingsTable)
    .values({ key: "airtable", value: JSON.stringify(parsed.data) })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: JSON.stringify(parsed.data), updatedAt: new Date() },
    });
  res.json({
    apiKeySet: parsed.data.apiKey.length > 0,
    baseId: parsed.data.baseId,
    tableId: parsed.data.tableId,
    enabled: false,
  });
});

export default router;
