"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import type { Role } from "@/db/schema";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavLinks } from "./nav-links";

export function MobileNav({ role, openCount }: { role: Role; openCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 border-0 bg-sidebar px-4 py-6 text-sidebar-foreground">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Logo className="mb-8 ml-2 w-28" />
        <div onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          <NavLinks role={role} openCount={openCount} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
