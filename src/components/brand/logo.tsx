import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ variant = "white", className }: { variant?: "white" | "black"; className?: string }) {
  return (
    <Image
      src={variant === "white" ? "/brand/logo-white.png" : "/brand/logo-black.png"}
      alt="Outsource Logistics"
      width={300}
      height={172}
      priority
      className={cn("h-auto w-36", className)}
    />
  );
}

export function Tagline({ className }: { className?: string }) {
  return (
    <p className={cn("font-heading text-xs tracking-[0.2em] uppercase", className)}>
      Warehouse. Port Services. Logistics.
    </p>
  );
}

export function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={cn("text-[10px] tracking-wide", className)}>
      Powered by <span className="font-semibold">Agrovus</span>
    </p>
  );
}
