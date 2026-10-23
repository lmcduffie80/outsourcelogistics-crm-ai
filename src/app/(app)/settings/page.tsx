import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { demoEnabled, entraEnabled } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aiStatus } from "@/lib/ai/ollama";
import { aiProvider, providerLabel } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime, timeAgo } from "@/lib/format";
import { graphConfigured, mailbox } from "@/lib/graph/client";
import { webhookConfigured } from "@/lib/graph/subscriptions";
import { transportName } from "@/lib/mail/transport";
import { getSetting } from "@/lib/settings";
import { AckTemplateForm, AiForm, SlaForm } from "./settings-forms";
import { AddUserDialog, UserTable } from "./user-table";

export const metadata: Metadata = { title: "Settings" };

type Health = "ok" | "warn" | "off";

function StatusLine({ health, label, detail }: { health: Health; label: string; detail?: React.ReactNode }) {
  const Icon = { ok: CheckCircle2, warn: CircleAlert, off: CircleDashed }[health];
  const color = { ok: "text-svc-port", warn: "text-svc-transportation", off: "text-muted-foreground" }[health];
  return (
    <div className="flex gap-2.5 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
      <div>
        <p className="font-semibold">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const admin = await requireRole("admin");
  const [staff, ack, sla, assignment, ai, graphState, aiServer] = await Promise.all([
    db.query.users.findMany({ orderBy: [asc(users.role), asc(users.name)] }),
    getSetting("ackTemplate"),
    getSetting("sla"),
    getSetting("assignment"),
    getSetting("ai"),
    getSetting("graphState"),
    aiStatus(),
  ]);

  const graphLive = graphConfigured();
  const transport = transportName();
  const subExpires = graphState.subscriptionExpiresAt ? new Date(graphState.subscriptionExpiresAt) : null;
  const modelInstalled = aiServer.ok && aiServer.models.includes(ai.model);

  return (
    <>
      <PageHeader title="Settings" description="Team access, customer messaging, response targets, and the AI model." />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Mailbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusLine
              health={graphLive ? "ok" : "warn"}
              label={graphLive ? `Connected to ${mailbox()}` : "Microsoft Graph not configured"}
              detail={graphLive ? "App-only access via Microsoft Graph" : "Set the GRAPH_* variables to read the inbox"}
            />
            <StatusLine
              health={transport === "graph" ? "ok" : "warn"}
              label={transport === "graph" ? "Sending real email" : "Sending is simulated"}
              detail={transport === "graph" ? "Replies go out from the shared mailbox" : "MAIL_TRANSPORT=fake logs emails instead of sending"}
            />
            <StatusLine
              health={!webhookConfigured() ? "off" : subExpires && subExpires > new Date() ? "ok" : "warn"}
              label={
                !webhookConfigured()
                  ? "Push notifications off (polling every 2 minutes)"
                  : subExpires && subExpires > new Date()
                    ? "Push notifications active"
                    : "Push subscription expired"
              }
              detail={subExpires ? `Renews before ${formatDateTime(subExpires)}` : undefined}
            />
            <StatusLine
              health={graphState.lastSyncAt ? "ok" : "off"}
              label={graphState.lastSyncAt ? `Last sync ${timeAgo(new Date(graphState.lastSyncAt))}` : "No sync yet"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">AI server</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusLine
              health={aiServer.ok ? "ok" : "warn"}
              label={
                aiServer.ok ? `${providerLabel} online (${aiServer.models.length} models)` : `${providerLabel} unreachable`
              }
              detail={aiServer.ok ? undefined : "Inquiries still get created, using rule-based extraction and a template draft"}
            />
            <StatusLine
              health={modelInstalled ? "ok" : "warn"}
              label={`Model: ${ai.model}`}
              detail={
                modelInstalled
                  ? "Available"
                  : aiProvider === "openai"
                    ? "Not available to this API key"
                    : `Run: ollama pull ${ai.model}`
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Sign-in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusLine
              health={entraEnabled ? "ok" : "warn"}
              label={entraEnabled ? "Microsoft Entra ID single sign-on" : "Microsoft sign-in not configured"}
              detail={entraEnabled ? undefined : "Set the AUTH_MICROSOFT_ENTRA_ID_* variables"}
            />
            <StatusLine
              health={demoEnabled ? "warn" : "off"}
              label={demoEnabled ? "Demo sign-in enabled" : "Demo sign-in disabled"}
              detail={demoEnabled ? "Anyone can pick a user on the login page. Development only." : undefined}
            />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="ack">Acknowledgment email</TabsTrigger>
          <TabsTrigger value="sla">Response targets</TabsTrigger>
          <TabsTrigger value="ai">AI model</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Anyone with an allowed company email gets a rep account on first Microsoft sign-in. Add people here to
              give them a different role up front, or deactivate them to revoke access immediately.
            </p>
            <AddUserDialog />
          </div>
          <UserTable
            currentUserId={admin.id}
            rows={staff.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
              active: u.active,
              lastLoginAt: u.lastLoginAt,
            }))}
          />
        </TabsContent>

        <TabsContent value="ack" className="mt-4">
          <AckTemplateForm initial={ack} />
        </TabsContent>

        <TabsContent value="sla" className="mt-4">
          <SlaForm initial={{ ...sla, assignmentMode: assignment.mode }} />
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <AiForm initial={ai} provider={aiProvider} installedModels={aiServer.ok ? aiServer.models : []} />
        </TabsContent>
      </Tabs>
    </>
  );
}
