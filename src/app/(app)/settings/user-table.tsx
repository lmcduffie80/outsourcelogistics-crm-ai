"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/lib/format";
import { addUserAction, updateUserAction, type ActionResult } from "./actions";

const roleLabels: Record<Role, string> = { rep: "Customer service rep", manager: "Manager", admin: "Admin" };

type UserRow = { id: string; name: string; email: string; role: Role; active: boolean; lastLoginAt: Date | null };

function notify(r: ActionResult) {
  if (r.ok) toast.success(r.message ?? "Saved");
  else toast.error(r.error);
  return r.ok;
}

function RoleSelect({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)} disabled={disabled}>
      <SelectTrigger size="sm" className="w-48" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(roleLabels).map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UserRowView({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const update = (input: { role?: Role; active?: boolean }) => start(async () => void notify(await updateUserAction(user.id, input)));
  return (
    <TableRow className={user.active ? undefined : "opacity-60"}>
      <TableCell>
        <p className="font-medium">
          {user.name} {isSelf && <Badge variant="secondary">You</Badge>}
        </p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </TableCell>
      <TableCell>
        <RoleSelect value={user.role} disabled={pending || isSelf} onChange={(role) => update({ role })} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never signed in"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={user.active}
            disabled={pending || isSelf}
            onCheckedChange={(active) => update({ active })}
            aria-label={`${user.active ? "Deactivate" : "Activate"} ${user.name}`}
          />
          <span className="text-sm">{user.active ? "Active" : "Deactivated"}</span>
          {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function UserTable({ rows, currentUserId }: { rows: UserRow[]; currentUserId: string }) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Last sign-in</TableHead>
            <TableHead>Access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => (
            <UserRowView key={u.id} user={u} isSelf={u.id === currentUserId} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AddUserDialog() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("rep");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Add person
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Add a team member</DialogTitle>
          <DialogDescription>They sign in with their Microsoft account using this email address.</DialogDescription>
        </DialogHeader>
        <form
          id="add-user"
          className="space-y-4"
          action={(fd) =>
            start(async () => {
              const ok = notify(
                await addUserAction({ name: String(fd.get("name")), email: String(fd.get("email")), role }),
              );
              if (ok) {
                setOpen(false);
                setRole("rep");
              }
            })
          }
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" name="email" type="email" required placeholder="name@outsourcelogistics.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <RoleSelect value={role} onChange={setRole} />
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="add-user" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Add person
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
