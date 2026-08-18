/**
 * Seed realistic sample data: five made-up schools with contacts and workshop
 * dates — one fully answered, two partly answered, two untouched — with one
 * question edited a few times by different people so history has something
 * real to display. Also seeds Pam's admin account plus a backup admin, and a
 * couple of published info pages.
 *
 * Run: pnpm --filter @workspace/scripts run seed
 */
import crypto from "node:crypto";
import {
  db,
  pool,
  adminUsersTable,
  answersTable,
  appSettingsTable,
  contactsTable,
  infoPagesTable,
  schoolsTable,
  teacherSnapshotsTable,
} from "@workspace/db";

const PAM_EMAIL = "programcoordinator@touchofunderstanding.org";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number, hour = 10, minute = 0): Date {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const existing = await db.select().from(schoolsTable);
  if (existing.length > 0) {
    console.log("Already seeded, skipping.");
    return;
  }

  // Admin accounts: Pam + a backup so nobody can strand themselves.
  await db.insert(adminUsersTable).values([
    { email: PAM_EMAIL, passwordHash: hashPassword("atou-pam-2026") },
    { email: "director@touchofunderstanding.org", passwordHash: hashPassword("atou-backup-2026") },
  ]);

  const schools = await db
    .insert(schoolsTable)
    .values([
      { name: "Sierra Vista Elementary", code: "8f3k9d2m", workshopDate: daysFromNow(20) },
      { name: "Oakmont Elementary", code: "q7w2p5xr", workshopDate: daysFromNow(35) },
      { name: "Del Rio Charter School", code: "t4n8b6vz", workshopDate: daysFromNow(58) },
      { name: "Placer Hills Elementary", code: "j9m3c7ks", workshopDate: daysFromNow(63) },
      { name: "Golden Meadow Academy", code: "z2h6f4wd", workshopDate: daysFromNow(90) },
    ])
    .returning();

  const [sierra, oakmont, delRio, placer, golden] = schools;

  await db.insert(contactsTable).values([
    { schoolId: sierra!.id, email: "mgarcia@sierravista.k12.ca.us", name: "Maria Garcia (Office Manager)" },
    { schoolId: sierra!.id, email: "principal@sierravista.k12.ca.us", name: "Dan Whitfield (Principal)" },
    { schoolId: sierra!.id, email: "jchen@sierravista.k12.ca.us", name: "Jennifer Chen (3rd Grade)" },
    { schoolId: oakmont!.id, email: "office@oakmontelementary.org", name: "Terri Lawson (Office Admin)" },
    { schoolId: oakmont!.id, email: "khudson@oakmontelementary.org", name: "Kate Hudson (Principal)" },
    { schoolId: delRio!.id, email: "frontdesk@delriocharter.org", name: "Sam Ortiz (Front Desk)" },
    { schoolId: delRio!.id, email: "apatel@delriocharter.org", name: "Anjali Patel (Principal)" },
    { schoolId: placer!.id, email: "secretary@placerhills.k12.ca.us", name: "Donna Reese (Secretary)" },
    { schoolId: golden!.id, email: "admin@goldenmeadow.org", name: "Luis Romero (Admin)" },
    { schoolId: golden!.id, email: "head@goldenmeadow.org", name: "Sarah Kim (Head of School)" },
  ]);

  // --- Sierra Vista: fully answered, with real edit history ---
  await db.insert(teacherSnapshotsTable).values([
    {
      schoolId: sierra!.id,
      rows: [
        { firstName: "Jennifer", lastName: "Chen", email: "jchen@sierravista.k12.ca.us", studentCount: 24 },
        { firstName: "Robert", lastName: "Maldonado", email: "rmaldonado@sierravista.k12.ca.us", studentCount: 26 },
      ],
      totalStudents: 50,
      enteredBy: "mgarcia@sierravista.k12.ca.us",
      enteredAt: daysAgo(12, 9, 40),
    },
    {
      schoolId: sierra!.id,
      rows: [
        { firstName: "Jennifer", lastName: "Chen", email: "jchen@sierravista.k12.ca.us", studentCount: 25 },
        { firstName: "Robert", lastName: "Maldonado", email: "rmaldonado@sierravista.k12.ca.us", studentCount: 26 },
        { firstName: "Alicia", lastName: "Fox", email: "afox@sierravista.k12.ca.us", studentCount: 24 },
      ],
      totalStudents: 75,
      enteredBy: "jchen@sierravista.k12.ca.us",
      enteredAt: daysAgo(8, 14, 15),
    },
    {
      schoolId: sierra!.id,
      rows: [
        { firstName: "Jennifer", lastName: "Chen", email: "jchen@sierravista.k12.ca.us", studentCount: 25 },
        { firstName: "Robert", lastName: "Maldonado", email: "rmaldonado@sierravista.k12.ca.us", studentCount: 28 },
        { firstName: "Alicia", lastName: "Fox", email: "afox@sierravista.k12.ca.us", studentCount: 24 },
        { firstName: "Brian", lastName: "Tran", email: "btran@sierravista.k12.ca.us", studentCount: 13 },
      ],
      totalStudents: 90,
      enteredBy: "mgarcia@sierravista.k12.ca.us",
      enteredAt: daysAgo(1, 16, 5),
    },
  ]);
  await db.insert(answersTable).values([
    // workshop_time edited by three different people over time
    { schoolId: sierra!.id, questionKey: "workshop_time", value: "08:30", enteredBy: "mgarcia@sierravista.k12.ca.us", enteredAt: daysAgo(12, 9, 45) },
    { schoolId: sierra!.id, questionKey: "workshop_time", value: "09:00", enteredBy: "principal@sierravista.k12.ca.us", enteredAt: daysAgo(9, 7, 55) },
    { schoolId: sierra!.id, questionKey: "workshop_time", value: "08:00", enteredBy: PAM_EMAIL, enteredAt: daysAgo(3, 11, 20) },
    { schoolId: sierra!.id, questionKey: "timing_note", value: "Morning recess is 10:00-10:15, so the built-in break lines up well.", enteredBy: "mgarcia@sierravista.k12.ca.us", enteredAt: daysAgo(12, 9, 47) },
    { schoolId: sierra!.id, questionKey: "activity_area", value: "MP room", enteredBy: "mgarcia@sierravista.k12.ca.us", enteredAt: daysAgo(12, 9, 50) },
    { schoolId: sierra!.id, questionKey: "speaker_area", value: "Library", enteredBy: "mgarcia@sierravista.k12.ca.us", enteredAt: daysAgo(12, 9, 52) },
    { schoolId: sierra!.id, questionKey: "notes", value: "Please check in at the front office for visitor badges. Parking lot on Oak St is closed for repaving — use the 5th Ave lot.", enteredBy: "principal@sierravista.k12.ca.us", enteredAt: daysAgo(9, 8, 0) },
  ]);

  // --- Oakmont: partly answered (teachers + time, missing areas) ---
  await db.insert(teacherSnapshotsTable).values({
    schoolId: oakmont!.id,
    rows: [
      { firstName: "Paul", lastName: "Nguyen", email: "pnguyen@oakmontelementary.org", studentCount: 22 },
      { firstName: "Rachel", lastName: "Simmons", email: "rsimmons@oakmontelementary.org", studentCount: 21 },
    ],
    totalStudents: 43,
    enteredBy: "office@oakmontelementary.org",
    enteredAt: daysAgo(5, 13, 30),
  });
  await db.insert(answersTable).values([
    { schoolId: oakmont!.id, questionKey: "workshop_time", value: "08:45", enteredBy: "office@oakmontelementary.org", enteredAt: daysAgo(5, 13, 35) },
  ]);

  // --- Del Rio: partly answered (just one area) ---
  await db.insert(answersTable).values([
    { schoolId: delRio!.id, questionKey: "activity_area", value: "Rooms 12 and 14 (next door to each other)", enteredBy: "frontdesk@delriocharter.org", enteredAt: daysAgo(2, 15, 10) },
  ]);

  // --- Placer Hills & Golden Meadow: untouched ---

  // Info pages
  await db.insert(infoPagesTable).values([
    {
      title: "Program Overview",
      slug: "program-overview",
      body: "<h2>What to expect on workshop day</h2><p>A Touch of Understanding brings <b>disability awareness workshops</b> to your school. The day runs in two 90-minute sections with a 15-minute break between them.</p><p>Students rotate through <u>activity stations</u> and then hear from our volunteer speakers.</p>",
      sortOrder: 1,
      published: true,
    },
    {
      title: "Preparing Your Classroom",
      slug: "preparing-your-classroom",
      body: "<h2>Room setup</h2><p>We need two classrooms near each other, or an MP room or library. Please have desks moved to the edges before we arrive.</p><p>Take-home materials are packed <b>separately for each teacher</b> — that's why we ask for student counts per teacher.</p>",
      sortOrder: 2,
      published: true,
    },
    {
      title: "2025-26 Cost Sheet",
      slug: "cost-sheet-2025-26",
      body: "<p>Seasonal page — unpublish when the school year ends.</p>",
      sortOrder: 3,
      published: false,
    },
  ]);

  console.log("Seeded 5 schools, contacts, answers with history, admins, and info pages.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
