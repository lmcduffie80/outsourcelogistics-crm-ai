import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth, demoEnabled, entraEnabled, signIn } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Logo, Tagline } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

const roleLabel = { admin: "Admin", manager: "Manager", rep: "Customer Service" } as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { callbackUrl, error } = await searchParams;
  const redirectTo = typeof callbackUrl === "string" && callbackUrl.startsWith("/") ? callbackUrl : "/";
  const sessionUserId = (await auth())?.user?.id;
  if (sessionUserId) {
    const user = await db.query.users.findFirst({
      where: and(eq(users.id, sessionUserId), eq(users.active, true)),
      columns: { id: true },
    });
    if (user) redirect(redirectTo);
  }

  const demoUsers = demoEnabled
    ? await db.query.users.findMany({
        where: eq(users.active, true),
        orderBy: [asc(users.role), asc(users.name)],
        columns: { id: true, name: true, role: true },
      })
    : [];

  async function signInMicrosoft() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo });
  }

  async function signInDemo(formData: FormData) {
    "use server";
    await signIn("demo", { userId: formData.get("userId"), redirectTo });
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-steel-800 p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 bg-[url('/brand/port-of-savannah.jpg')] bg-cover bg-center opacity-25 mix-blend-luminosity"
        />
        <div className="relative">
          <Logo className="w-44" />
        </div>
        <div className="relative max-w-md space-y-4">
          <h1 className="text-4xl leading-tight uppercase">
            The capacity <span className="brand-amp text-steel-200">&amp;</span> expertise to handle your
            customers&apos; next logistics challenge
          </h1>
          <p className="text-steel-100">
            Every inquiry from the quotes inbox, acknowledged in seconds and answered by our team with an AI-drafted
            reply.
          </p>
        </div>
        <Tagline className="relative text-steel-200" />
      </section>

      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-3">
            <Logo variant="black" className="w-32 lg:hidden" />
            <CardTitle className="font-heading text-2xl">Sign in to the CRM</CardTitle>
            <CardDescription>Use your Outsource Logistics Microsoft 365 account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error === "AccessDenied"
                  ? "Your account isn't authorized for the CRM. Ask an admin to add you."
                  : "Sign-in failed. Please try again."}
              </p>
            )}

            {entraEnabled ? (
              <form action={signInMicrosoft}>
                <Button type="submit" size="lg" className="w-full">
                  <MicrosoftIcon />
                  Sign in with Microsoft
                </Button>
              </form>
            ) : (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Microsoft sign-in isn&apos;t configured yet. Set the <code>AUTH_MICROSOFT_ENTRA_ID_*</code> variables.
              </p>
            )}

            {demoEnabled && demoUsers.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs tracking-wide text-muted-foreground uppercase">
                  <span className="h-px flex-1 bg-border" />
                  Demo sign-in (development only)
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-2">
                  {demoUsers.map((u) => (
                    <form key={u.id} action={signInDemo}>
                      <input type="hidden" name="userId" value={u.id} />
                      <Button type="submit" variant="outline" className="w-full justify-between">
                        <span>{u.name}</span>
                        <span className="text-xs text-muted-foreground">{roleLabel[u.role]}</span>
                      </Button>
                    </form>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 21 21" className="size-4" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
