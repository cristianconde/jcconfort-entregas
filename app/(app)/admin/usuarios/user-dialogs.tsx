"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError, FormField } from "@/components/form-field";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { ROLE_ITEMS } from "@/lib/labels";
import type { UserRow } from "./users-admin";

const PHONE_HINT = "Formato internacional, por ejemplo +34600111222. Es un dato de contacto: no recibe SMS.";

export function UserDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const create = useAction(api.users.create);
  const update = useMutation(api.users.update);
  const [role, setRole] = useState<"admin" | "member">(user?.role ?? "member");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "").trim() || undefined;
    const name = String(form.get("name"));
    setPending(true);
    setError(null);
    try {
      if (user) {
        await update({ userId: user._id, name, role, phone });
        toast.success("Usuario actualizado");
      } else {
        await create({
          name,
          email: String(form.get("email")),
          password: String(form.get("password")),
          role,
          phone,
        });
        toast.success("Usuario creado");
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
          <DialogDescription>
            {user
              ? user.email
              : "Comparte el email y la contraseña inicial con la persona para que pueda entrar."}
          </DialogDescription>
        </DialogHeader>
        <form id="user-form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField id="name" label="Nombre">
            <Input id="name" name="name" required defaultValue={user?.name} />
          </FormField>
          {!user && (
            <>
              <FormField id="email" label="Email">
                <Input id="email" name="email" type="email" required autoComplete="off" />
              </FormField>
              <FormField id="password" label="Contraseña inicial" hint="Mínimo 8 caracteres.">
                <Input
                  id="password"
                  name="password"
                  type="text"
                  required
                  minLength={8}
                  autoComplete="off"
                />
              </FormField>
            </>
          )}
          <FormField id="role" label="Rol">
            <Select
              items={ROLE_ITEMS}
              value={role}
              onValueChange={(value) => setRole(value as "admin" | "member")}
            >
              <SelectTrigger id="role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="phone" label="Teléfono" hint={PHONE_HINT}>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+34600111222"
              defaultValue={user?.phone}
            />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" disabled={pending}>
            {pending ? "Guardando…" : user ? "Guardar" : "Crear usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const resetPassword = useAction(api.users.resetPassword);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await resetPassword({ userId: user._id, password: String(form.get("password")) });
      toast.success(`Contraseña de ${user.name} restablecida`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            Nueva contraseña para {user.name}. Compártela con la persona por un canal seguro.
          </DialogDescription>
        </DialogHeader>
        <form id="reset-form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField id="password" label="Nueva contraseña" hint="Mínimo 8 caracteres.">
            <Input id="password" name="password" required minLength={8} autoComplete="off" />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="reset-form" disabled={pending}>
            {pending ? "Guardando…" : "Restablecer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
