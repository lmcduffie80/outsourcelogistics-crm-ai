import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, type Role, type User } from "@/db/schema";

export type CurrentUser = Pick<User, "id" | "name" | "email" | "role">;

/**
 * Resolves the signed-in staff member from the database on every request, so
 * role changes and deactivations take effect without waiting for the JWT to expire.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!user || !user.active) redirect("/login?error=AccessDenied");
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!roles.includes(user.role)) redirect("/inquiries");
  return user;
}

export const isManager = (user: CurrentUser) => user.role === "manager" || user.role === "admin";
