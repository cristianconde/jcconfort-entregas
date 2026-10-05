"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { KeyRoundIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/components/current-user";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/labels";
import { ResetPasswordDialog, UserDialog } from "./user-dialogs";

export type UserRow = FunctionReturnType<typeof api.users.list>[number];

export function UsersAdmin() {
  const me = useCurrentUser();
  const [search, setSearch] = useState("");
  const users = useQuery(api.users.list, { search });
  const setActive = useMutation(api.users.setActive);
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  async function toggleActive(user: UserRow, isActive: boolean) {
    try {
      await setActive({ userId: user._id, isActive });
      toast.success(isActive ? `${user.name} reactivado` : `${user.name} desactivado`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title mr-auto ">Usuarios</h1>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar usuarios"
            placeholder="Buscar por nombre o email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64 pl-8"
          />
        </div>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon /> Nuevo usuario
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users === undefined &&
              [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {users?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No hay usuarios que coincidan con la búsqueda.
                </TableCell>
              </TableRow>
            )}
            {users?.map((user) => (
              <TableRow key={user._id} className={user.isActive ? undefined : "opacity-60"}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </TableCell>
                <TableCell>{user.phone ?? "—"}</TableCell>
                <TableCell>
                  <Switch
                    aria-label={user.isActive ? "Desactivar usuario" : "Reactivar usuario"}
                    checked={user.isActive}
                    disabled={user._id === me._id}
                    onCheckedChange={(checked) => void toggleActive(user, checked)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Editar a ${user.name}`}
                      onClick={() => setEditing(user)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Restablecer contraseña de ${user.name}`}
                      onClick={() => setResetting(user)}
                    >
                      <KeyRoundIcon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <UserDialog
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
