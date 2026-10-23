"use client";

import { useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
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
import { orderCsvColumns } from "@/lib/orders-csv";
import { importOrdersAction } from "./actions";

export function ImportOrdersDialog() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Import orders</DialogTitle>
          <DialogDescription>
            Bring in orders from your freight or warehouse portal. Rows are matched on <code>external_ref</code>, so
            re-importing the same file updates orders instead of duplicating them.
          </DialogDescription>
        </DialogHeader>
        <form
          id="import-form"
          action={(fd) =>
            start(async () => {
              const r = await importOrdersAction(fd);
              if (r.ok) {
                toast.success(r.message ?? "Imported");
                setOpen(false);
              } else toast.error(r.error);
            })
          }
          className="space-y-3"
        >
          <Input type="file" name="file" accept=".csv,text/csv" required />
          <div className="rounded-md bg-muted p-3 text-xs">
            <p className="mb-1 font-semibold">Columns (header row required)</p>
            <p className="font-mono leading-relaxed break-words">{orderCsvColumns.join(", ")}</p>
            <p className="mt-2 text-muted-foreground">
              Only <code>external_ref</code> and <code>customer_email</code> are required. Status defaults to completed.
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="import-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
