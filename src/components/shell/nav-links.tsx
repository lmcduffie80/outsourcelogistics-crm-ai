"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Inbox, PackageCheck, Settings, UserRoundSearch } from "lucide-react";
import type { Role } from "@/db/schema";
import { cn } from "@/lib/utils";

const links = [
  { href: "/inquiries", label: "Inquiries", icon: Inbox, roles: ["rep", "manager", "admin"] },
  { href: "/orders", label: "Orders", icon: PackageCheck, roles: ["rep", "manager", "admin"] },
  { href: "/manager", label: "Team Dashboard", icon: BarChart3, roles: ["manager", "admin"] },
  { href: "/visitors", label: "Visitors", icon: UserRoundSearch, roles: ["admin"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
] as const;

export function NavLinks({ role, openCount }: { role: Role; openCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {links
        .filter((l) => (l.roles as readonly Role[]).includes(role))
        .map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {href === "/inquiries" && openCount > 0 && (
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{openCount}</span>
              )}
            </Link>
          );
        })}
    </nav>
  );
}
