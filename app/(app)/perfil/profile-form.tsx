"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/components/current-user";
import { FormError, FormField } from "@/components/form-field";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/labels";

export function ProfileForm() {
  const me = useCurrentUser();
  const updateMe = useMutation(api.users.updateMe);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await updateMe({
        name: String(form.get("name")),
        phone: String(form.get("phone") ?? "").trim() || undefined,
      });
      toast.success("Perfil guardado");
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos personales</CardTitle>
        <CardDescription>
          {me.email} · {ROLE_LABELS[me.role]}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField id="name" label="Nombre">
            <Input id="name" name="name" required defaultValue={me.name} />
          </FormField>
          <FormField
            id="phone"
            label="Teléfono"
            hint="Formato internacional, por ejemplo +34600111222. Es un dato de contacto para el equipo: tus avisos llegan dentro de la aplicación."
          >
            <Input id="phone" name="phone" type="tel" defaultValue={me.phone} placeholder="+34600111222" />
          </FormField>
          <FormError message={error} />
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
