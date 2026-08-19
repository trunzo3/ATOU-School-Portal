import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  throw new Error("SESSION_SECRET must be set");
}
const SESSION_SECRET: string = SECRET;

export const PAM_EMAIL = "programcoordinator@touchofunderstanding.org";
const COOKIE_NAME = "atou_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// --- password hashing (scrypt) ---

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

// --- signed session cookie ---

type SessionPayload = { adminId: number; email: string; exp: number; iat?: number };

function sign(data: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
}

export function createSessionToken(adminId: number, email: string): string {
  const payload: SessionPayload = {
    adminId,
    email,
    exp: Date.now() + SESSION_TTL_MS,
    iat: Date.now(),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function parseSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = sign(data);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, adminId: number, email: string): void {
  res.cookie(COOKIE_NAME, createSessionToken(adminId, email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export type AdminRequest = Request & { admin?: { id: number; email: string } };

export async function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
  const payload = parseSessionToken(cookies[COOKIE_NAME]);
  if (!payload) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.id, payload.adminId));
  if (!admin) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  // Sessions issued before the last password change are no longer valid:
  // resetting a password signs out every device holding an old cookie.
  if (admin.passwordChangedAt && (payload.iat ?? 0) < admin.passwordChangedAt.getTime()) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  req.admin = { id: admin.id, email: admin.email };
  next();
}
