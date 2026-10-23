"use client";

import { useState, useTransition } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import type { InquiryExtraction } from "@/lib/ai/schemas";
import type { Priority, ServiceType } from "@/db/schema";
import { priorityLabels, serviceTypeLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  convertToOrderAction,
  reassignAction,
  setClosedAction,
  updateDetailsAction,
  type ActionResult,
} from "./actions";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        onOk?.();
      } else toast.error(r.error);
    });
  return [pending, run] as const;
}

function NamedSelect({
  name,
  defaultValue,
  options,
  disabled,
}: {
  name: string;
  defaultValue: string;
  options: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <Select name={name} defaultValue={defaultValue} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DetailsForm({
  inquiryId,
  serviceType,
  priority,
  summary,
  extracted,
  canEdit,
}: {
  inquiryId: string;
  serviceType: ServiceType;
  priority: Priority;
  summary: string | null;
  extracted: InquiryExtraction | null;
  canEdit: boolean;
}) {
  const [pending, run] = useAction();
  const text = (name: keyof InquiryExtraction, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        defaultValue={(extracted?.[name] as string | null) ?? ""}
        disabled={!canEdit}
        className="h-8"
      />
    </div>
  );

  return (
    <form action={(fd) => run(() => updateDetailsAction(inquiryId, fd))} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Service</Label>
          <NamedSelect name="serviceType" defaultValue={serviceType} options={serviceTypeLabels} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Priority</Label>
          <NamedSelect name="priority" defaultValue={priority} options={priorityLabels} disabled={!canEdit} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="summary" className="text-xs text-muted-foreground">
          Summary
        </Label>
        <Textarea id="summary" name="summary" defaultValue={summary ?? ""} disabled={!canEdit} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {text("origin", "Origin")}
        {text("destination", "Destination")}
        {text("commodity", "Commodity")}
        {text("weight", "Weight")}
        {text("volume", "Volume")}
        {text("requestedDate", "Requested date")}
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch name="hazmat" defaultChecked={extracted?.hazmat} disabled={!canEdit} /> Hazmat
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch name="foodGrade" defaultChecked={extracted?.foodGrade} disabled={!canEdit} /> Food grade
        </label>
      </div>
      {extracted?.questions && extracted.questions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Customer questions</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
            {extracted.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {canEdit && (
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save details
        </Button>
      )}
    </form>
  );
}

export function AssignmentControl({
  inquiryId,
  repId,
  reps,
  canReassign,
}: {
  inquiryId: string;
  repId: string | null;
  reps: { id: string; name: string }[];
  canReassign: boolean;
}) {
  const [pending, run] = useAction();
  return (
    <div className="flex items-center gap-2">
      <Select
        value={repId ?? undefined}
        onValueChange={(v) => run(() => reassignAction(inquiryId, v))}
        disabled={!canReassign || pending}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          {reps.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2 className="size-4 animate-spin" />}
    </div>
  );
}

export function CloseButton({ inquiryId, closed, canEdit }: { inquiryId: string; closed: boolean; canEdit: boolean }) {
  const [pending, run] = useAction();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!canEdit || pending}
      onClick={() => run(() => setClosedAction(inquiryId, !closed))}
    >
      {pending && <Loader2 className="animate-spin" />}
      {closed ? "Reopen inquiry" : "Close without order"}
    </Button>
  );
}

export function ConvertToOrderDialog({
  inquiryId,
  serviceType,
  summary,
  origin,
  destination,
  canEdit,
}: {
  inquiryId: string;
  serviceType: ServiceType;
  summary: string | null;
  origin: string | null;
  destination: string | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!canEdit} className="bg-svc-port hover:bg-svc-port/90">
          <PackagePlus />
          Convert to order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Convert to order</DialogTitle>
          <DialogDescription>Books an order for this customer and marks the inquiry as converted.</DialogDescription>
        </DialogHeader>
        <form
          id="convert-form"
          action={(fd) => run(() => convertToOrderAction(inquiryId, fd), () => setOpen(false))}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label>Service</Label>
            <NamedSelect name="serviceType" defaultValue={serviceType} options={serviceTypeLabels} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={summary ?? ""} rows={3} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="origin">Origin</Label>
              <Input id="origin" name="origin" defaultValue={origin ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="destination">Destination</Label>
              <Input id="destination" name="destination" defaultValue={destination ?? ""} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="value">Order value (USD)</Label>
            <Input id="value" name="value" inputMode="decimal" placeholder="e.g. 3,200" />
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="convert-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
