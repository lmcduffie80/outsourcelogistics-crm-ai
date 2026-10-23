import { and, count, eq, inArray } from "drizzle-orm";
import { Phone } from "lucide-react";
import { db } from "@/db";
import { inquiries } from "@/db/schema";
import { providerLabel } from "@/lib/ai/provider";
import { getCurrentUser, isManager } from "@/lib/auth/session";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { openInquiryStatuses } from "@/lib/labels";
import { Logo, PoweredBy, Tagline } from "@/components/brand/logo";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NavLinks } from "@/components/shell/nav-links";
import { UserMenu } from "@/components/shell/user-menu";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const [{ open }] = await db
    .select({ open: count() })
    .from(inquiries)
    .where(
      and(
        inArray(inquiries.status, openInquiryStatuses),
        isManager(user) ? undefined : eq(inquiries.assignedRepId, user.id),
      ),
    );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <div className="mb-8 px-2">
          <Logo className="w-32" />
          <p className="mt-2 font-heading text-[11px] tracking-[0.25em] text-steel-300 uppercase">
            Customer Hub
          </p>
        </div>
        <NavLinks role={user.role} openCount={open} />
        <div className="mt-auto space-y-2 px-2 text-xs text-steel-300">
          <a href="tel:+18667262715" className="flex items-center gap-2 hover:text-white">
            <Phone className="size-3.5" /> (866) 726-2715
          </a>
          <Tagline className="text-[10px] text-steel-400" />
          <PoweredBy className="text-steel-400" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav role={user.role} openCount={open} />
            <Logo variant="black" className="w-20" />
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            <AssistantPanel role={user.role} provider={providerLabel} />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
