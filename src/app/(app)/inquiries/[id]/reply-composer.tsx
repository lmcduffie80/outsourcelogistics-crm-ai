"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, Send, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { takeReply, usePendingReply } from "@/components/assistant/reply-bridge";
import { regenerateDraftAction, sendReplyAction } from "./actions";

type Draft = { id: string; generatedText: string; model: string; createdAt: Date } | null;

export function ReplyComposer({
  inquiryId,
  draft,
  customerEmail,
  canEdit,
}: {
  inquiryId: string;
  draft: Draft;
  customerEmail: string;
  canEdit: boolean;
}) {
  const [body, setBody] = useState(draft?.generatedText ?? "");
  const [draftId, setDraftId] = useState(draft?.id ?? null);
  const [syncedDraft, setSyncedDraft] = useState(draft?.id);
  const [sending, startSend] = useTransition();
  const [regenerating, startRegen] = useTransition();

  // Adopt a newly generated draft (e.g. after Regenerate) when the server re-renders.
  if (draft?.id !== syncedDraft) {
    setSyncedDraft(draft?.id);
    setDraftId(draft?.id ?? null);
    setBody(draft?.generatedText ?? "");
  }

  const assistantReply = usePendingReply(inquiryId);
  if (assistantReply && canEdit) {
    takeReply(assistantReply.nonce);
    setBody(assistantReply.body);
  }

  const fallback = draft && (draft.model === "template" || draft.model === "heuristic");
  const edited = draft ? body.trim() !== draft.generatedText.trim() : false;

  const send = () =>
    startSend(async () => {
      const r = await sendReplyAction(inquiryId, draftId, body);
      if (r.ok) {
        toast.success(r.message ?? "Sent");
        setBody("");
        setDraftId(null);
      } else toast.error(r.error);
    });

  const regenerate = () =>
    startRegen(async () => {
      const r = await regenerateDraftAction(inquiryId);
      if (r.ok) toast.success(r.message ?? "Draft regenerated");
      else toast.error(r.error);
    });

  return (
    <div id="reply-composer" className="scroll-mt-20 rounded-lg border-2 border-steel-200 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-steel-50 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-steel-500" />
          <span className="font-semibold text-steel-800">Reply to {customerEmail}</span>
          {draft && (
            <span className="text-xs text-muted-foreground">
              {fallback ? "Template draft" : `AI draft · ${draft.model}`}
              {edited && " · edited"}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={regenerate} disabled={!canEdit || regenerating || sending}>
          {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {draft ? "Regenerate" : "Generate AI draft"}
        </Button>
      </div>
      {fallback && (
        <p className="flex items-center gap-2 border-b bg-svc-transportation/10 px-4 py-2 text-xs text-[#8a5514]">
          <TriangleAlert className="size-3.5" />
          The AI model was unreachable, so this is a template. Edit it or regenerate once the AI is back.
        </p>
      )}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!canEdit || sending}
        placeholder={regenerating ? "Drafting with AI..." : "Write your reply..."}
        className="min-h-64 resize-y rounded-none border-0 px-4 py-3 font-sans text-sm leading-relaxed shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
        <p className="text-xs text-muted-foreground">
          {canEdit ? "Sent from the shared mailbox, in the customer's original thread." : "Assigned to another rep."}
        </p>
        <Button onClick={send} disabled={!canEdit || sending || body.trim().length < 10}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          Send reply
        </Button>
      </div>
    </div>
  );
}
