import type { Metadata } from "next";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { PageHeader } from "@/components/page-header";
import { providerLabel } from "@/lib/ai/provider";
import { getCurrentUser, isManager } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Chat Assistant" };

export default async function AssistantPage() {
  const user = await getCurrentUser();
  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col">
      <PageHeader
        title="Chat Assistant"
        description={
          isManager(user)
            ? "Look up orders and inquiries, draft customer replies, and get quick team analytics."
            : "Look up orders and inquiries, draft customer replies, and check your own stats."
        }
      />
      <AssistantChat role={user.role} provider={providerLabel} />
    </div>
  );
}
