"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Bot, Loader2, MailPlus, RotateCcw, Sparkles, Square } from "lucide-react";
import { Streamdown } from "streamdown";
import type { Role } from "@/db/schema";
import type { AssistantUIMessage } from "@/lib/assistant/tools";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { queueReply } from "./reply-bridge";

const toolStatus: Record<string, string> = {
  searchOrders: "Searching orders",
  getOrder: "Opening order",
  searchInquiries: "Searching inquiries",
  getInquiry: "Reading the inquiry",
  draftReply: "Drafting reply",
  myMetrics: "Checking your stats",
  teamMetrics: "Crunching team analytics",
};

function suggestionsFor(role: Role, onInquiry: boolean) {
  if (onInquiry)
    return ["Summarize this inquiry", "Draft a reply to this customer", "Show this customer's other orders"];
  const base = ["What orders are open right now?", "Which inquiries are past the response target?"];
  return role === "rep"
    ? [...base, "How are my response times this month?"]
    : [...base, "How did the team do this week?", "Who has the slowest first response this month?"];
}

export function AssistantPanel({ role, provider }: { role: Role; provider: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const inquiryId = pathname.match(/^\/inquiries\/([0-9a-f-]{36})/i)?.[1] ?? null;

  const { messages, sendMessage, status, stop, error, regenerate, setMessages, clearError } =
    useChat<AssistantUIMessage>({ transport: new DefaultChatTransport({ api: "/api/assistant" }) });
  const busy = status === "submitted" || status === "streaming";

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, status]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text: text.trim() }, { body: { inquiryId } });
    setInput("");
  };

  const applyDraft = (draftInquiryId: string, body: string) => {
    queueReply(draftInquiryId, body);
    setOpen(false);
    if (draftInquiryId === inquiryId) document.getElementById("reply-composer")?.scrollIntoView({ behavior: "smooth" });
    else router.push(`/inquiries/${draftInquiryId}#reply-composer`);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles />
          Assistant
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="size-4 text-steel-500" /> Assistant
            </SheetTitle>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => (stop(), setMessages([]), clearError())}>
                <RotateCcw /> New chat
              </Button>
            )}
          </div>
          <SheetDescription>
            {inquiryId ? "Ask about this inquiry, or anything else." : "Look up orders and inquiries, draft replies, and get quick stats."}
          </SheetDescription>
        </SheetHeader>

        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Try asking</p>
              {suggestionsFor(role, Boolean(inquiryId)).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="block w-full rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-steel-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="ml-auto max-w-[85%] rounded-lg bg-steel-700 px-3 py-2 text-sm text-white">
                {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
              </div>
            ) : (
              <div key={m.id} className="space-y-2 text-sm">
                {m.parts.map((p, i) => {
                  if (p.type === "text")
                    return (
                      <Streamdown key={i} className="space-y-2 leading-relaxed" isAnimating={busy}>
                        {p.text}
                      </Streamdown>
                    );
                  if (p.type === "tool-draftReply" && p.state === "output-available" && !("error" in p.output)) {
                    const draft = p.output;
                    return (
                      <div key={i} className="rounded-lg border-2 border-steel-200 bg-card">
                        <p className="border-b bg-steel-50 px-3 py-2 text-xs font-semibold text-steel-800">
                          Draft reply · {draft.inquiry}
                        </p>
                        <p className="max-h-56 overflow-y-auto px-3 py-2 text-sm whitespace-pre-wrap">{draft.body}</p>
                        <div className="flex justify-end border-t px-3 py-2">
                          <Button size="sm" onClick={() => applyDraft(draft.inquiryId, draft.body)}>
                            <MailPlus /> Put in reply box
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  if (p.type.startsWith("tool-") && "state" in p && p.state !== "output-available" && p.state !== "output-error") {
                    return (
                      <p key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        {toolStatus[p.type.slice(5)] ?? "Working"}…
                      </p>
                    );
                  }
                  return null;
                })}
              </div>
            ),
          )}

          {status === "submitted" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Thinking…
            </p>
          )}
          {error && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-svc-value/30 bg-svc-value/5 px-3 py-2 text-sm">
              <span>Something went wrong reaching the assistant.</span>
              <Button variant="outline" size="sm" onClick={() => regenerate({ body: { inquiryId } })}>
                Retry
              </Button>
            </div>
          )}
        </div>

        <form
          className="border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder="Ask about orders, inquiries or performance…"
              className="max-h-40 min-h-11 resize-none text-sm"
            />
            {busy ? (
              <Button type="button" size="icon" variant="outline" onClick={() => stop()} aria-label="Stop">
                <Square />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
                <ArrowUp />
              </Button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {provider === "OpenAI"
              ? "Messages and the customer data the assistant looks up are sent to OpenAI."
              : `Runs on your ${provider} model.`}{" "}
            Replies are drafts; nothing is emailed until you press Send.
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
