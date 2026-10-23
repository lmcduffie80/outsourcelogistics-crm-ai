"use client";

import { useState, useTransition } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AiProvider } from "@/lib/ai/provider";
import { formatDuration } from "@/lib/format";
import type { AckTemplate, AiSettings, AssignmentSettings, SlaSettings } from "@/lib/settings";
import { renderTemplate, templateVariables } from "@/lib/template";
import { saveAckTemplateAction, saveAiAction, saveSlaAction, testAiAction, type ActionResult } from "./actions";

function notify(r: ActionResult) {
  if (r.ok) toast.success(r.message ?? "Saved");
  else toast.error(r.error);
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      Save changes
    </Button>
  );
}

const sampleVars = {
  firstName: "Jordan",
  customerName: "Jordan Ellis",
  inquiryNumber: "INQ-1234",
  serviceType: "port services",
  repName: "Maria Santos",
  subject: "Drayage quote: 3x40HC Garden City to Pooler",
};

export function AckTemplateForm({ initial }: { initial: AckTemplate }) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [pending, start] = useTransition();
  return (
    <form action={() => start(async () => notify(await saveAckTemplateAction({ subject, body })))}>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">Automatic acknowledgment</CardTitle>
          <CardDescription>
            Sent to the customer within seconds of a new inquiry arriving, before a rep replies. Available fields:{" "}
            {templateVariables.map((v) => (
              <code key={v} className="mr-1 rounded bg-muted px-1 text-xs">{`{{${v}}}`}</code>
            ))}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ack-subject">Subject</Label>
              <Input id="ack-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ack-body">Message</Label>
              <Textarea id="ack-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Preview</Label>
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="mb-3 border-b pb-3 font-semibold">{renderTemplate(subject, sampleVars)}</p>
              <p className="whitespace-pre-wrap">{renderTemplate(body, sampleVars)}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending} />
        </CardFooter>
      </Card>
    </form>
  );
}

export function SlaForm({ initial }: { initial: SlaSettings & { assignmentMode: AssignmentSettings["mode"] } }) {
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof values>(k: K, v: (typeof values)[K]) => setValues((s) => ({ ...s, [k]: v }));
  return (
    <form action={() => start(async () => notify(await saveSlaAction(values)))}>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">Response targets and routing</CardTitle>
          <CardDescription>
            The team dashboard scores reps against the first-response target, and the inquiry queue flags any customer
            left waiting past either target. The auto-acknowledgment doesn&apos;t count as a response.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="first">First response target (minutes)</Label>
            <Input
              id="first"
              type="number"
              min={5}
              value={values.firstResponseMinutes}
              onChange={(e) => set("firstResponseMinutes", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              {formatDuration(values.firstResponseMinutes)} from when the email arrives
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="follow">Follow-up target (minutes)</Label>
            <Input
              id="follow"
              type="number"
              min={5}
              value={values.followUpMinutes}
              onChange={(e) => set("followUpMinutes", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              {formatDuration(values.followUpMinutes)} to answer each later customer message
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>New inquiry assignment</Label>
            <Select value={values.assignmentMode} onValueChange={(v) => set("assignmentMode", v as typeof values.assignmentMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer_owner_then_round_robin">Customer&apos;s rep, then round robin</SelectItem>
                <SelectItem value="round_robin">Round robin only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Returning customers stay with the rep who owns the account.
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending} />
        </CardFooter>
      </Card>
    </form>
  );
}

export function AiForm({
  initial,
  provider,
  installedModels,
}: {
  initial: AiSettings;
  provider: AiProvider;
  installedModels: string[];
}) {
  const [model, setModel] = useState(initial.model);
  const [replyGuidelines, setGuidelines] = useState(initial.replyGuidelines);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [sample, setSample] = useState<string | null>(null);
  return (
    <form action={() => start(async () => notify(await saveAiAction({ model, replyGuidelines })))}>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {provider === "openai" ? "OpenAI model" : "Open-source model"}
          </CardTitle>
          <CardDescription>
            {provider === "openai"
              ? "Customer emails are sent to OpenAI's API for processing."
              : "Runs on your own Ollama server; customer emails never leave your network."}{" "}
            The model reads each inquiry, fills in shipment details, and drafts the rep&apos;s reply.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input id="model" list="installed-models" value={model} onChange={(e) => setModel(e.target.value)} />
              <datalist id="installed-models">
                {installedModels.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                {provider === "openai"
                  ? "Recommended: gpt-5.4-mini, or gpt-5.4 for higher-quality drafts."
                  : installedModels.length
                    ? `Installed: ${installedModels.join(", ")}`
                    : "Recommended: qwen2.5:14b, or llama3.1:8b on smaller GPUs."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guidelines">Reply guidelines</Label>
              <Textarea id="guidelines" rows={8} value={replyGuidelines} onChange={(e) => setGuidelines(e.target.value)} />
              <p className="text-xs text-muted-foreground">One rule per line. Included in every draft request.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Test draft</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testing}
                onClick={() =>
                  startTest(async () => {
                    const r = await testAiAction();
                    notify(r);
                    setSample(r.sample ?? null);
                  })
                }
              >
                {testing ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                Generate sample
              </Button>
            </div>
            <div className="min-h-48 rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
              {sample ?? (
                <span className="text-muted-foreground">
                  Save first, then generate a reply to a sample drayage and storage request.
                </span>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending} />
        </CardFooter>
      </Card>
    </form>
  );
}
