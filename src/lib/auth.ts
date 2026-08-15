import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { currentUser } from "./session";

export type Role = "owner" | "admin" | "viewer";

/** Ranking used by permission checks; higher wins. */
const RANK: Record<string, number> = { viewer: 1, admin: 2, owner: 3 };

export function atLeast(role: string, required: Role): boolean {
  return (RANK[role] ?? 0) >= RANK[required];
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** True until the setup wizard has created the first account. */
export async function needsSetup(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}

/** Throws when nobody is signed in. Use in server actions and route handlers. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("unauthorized");
  return user;
}

/** Throws unless the signed-in user has at least the given role. */
export async function requireRole(required: Role) {
  const user = await requireUser();
  if (!atLeast(user.role, required)) throw new Error("forbidden");
  return user;
}

/** Can this user rearrange dashboards and control containers? */
export function canEdit(user: { role: string } | null): boolean {
  return !!user && atLeast(user.role, "admin");
}
