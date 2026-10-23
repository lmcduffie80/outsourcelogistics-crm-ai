import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type Role } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

const demoEnabled = process.env.AUTH_DEMO === "true" && process.env.NODE_ENV !== "production";
export const entraEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);

const csv = (v?: string) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const allowedDomains = csv(process.env.ALLOWED_EMAIL_DOMAINS);
const adminEmails = csv(process.env.ADMIN_EMAILS);

/** Finds or provisions the staff user for an Entra sign-in. Returns null to deny. */
async function provisionEntraUser(email: string, name: string, oid?: string) {
  const normalized = email.toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(users.email, normalized) });
  if (existing) {
    if (!existing.active) return null;
    const [updated] = await db
      .update(users)
      .set({
        lastLoginAt: new Date(),
        entraOid: existing.entraOid ?? oid,
        role: adminEmails.includes(normalized) ? "admin" : existing.role,
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }
  const domain = normalized.split("@")[1];
  if (!allowedDomains.includes(domain) && !adminEmails.includes(normalized)) return null;
  const [created] = await db
    .insert(users)
    .values({
      email: normalized,
      name,
      entraOid: oid,
      role: adminEmails.includes(normalized) ? "admin" : "rep",
      lastLoginAt: new Date(),
    })
    .returning();
  return created;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    ...(entraEnabled ? [MicrosoftEntraID({})] : []),
    ...(demoEnabled
      ? [
          Credentials({
            id: "demo",
            name: "Demo",
            credentials: { userId: {} },
            async authorize(credentials) {
              const userId = String(credentials?.userId ?? "");
              const user = await db.query.users.findFirst({
                where: and(eq(users.id, userId), eq(users.active, true)),
              });
              if (!user) return null;
              await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
              return { id: user.id, email: user.email, name: user.name };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "microsoft-entra-id") return true;
      const email = (profile?.email ?? (profile?.preferred_username as string | undefined) ?? user.email) as
        | string
        | undefined;
      if (!email) return false;
      const dbUser = await provisionEntraUser(email, user.name ?? email, profile?.oid as string | undefined);
      if (!dbUser) return "/login?error=AccessDenied";
      user.id = dbUser.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await db.query.users.findFirst({ where: eq(users.email, user.email.toLowerCase()) });
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});

export { demoEnabled };
