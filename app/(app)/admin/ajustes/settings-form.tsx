"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { FormError, FormField } from "@/components/form-field";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";

type Settings = FunctionReturnType<typeof api.settings.get>;

/** Read-only: the provider and its credentials are deployment configuration. */
function ProviderStatus() {
  const status = useQuery(api.settings.providerStatus, {});
  if (!status) return <Skeleton className="h-4 w-48" />;
  return status.configured ? (
    <p className="text-xs">Proveedor: {status.label} · configurado</p>
  ) : (
    <p className="text-xs text-destructive">
      Proveedor de SMS sin configurar ({status.label}). No se enviará ningún SMS a clientes.
    </p>
  );
}

export function SettingsForm() {
  const settings = useQuery(api.settings.get, {});
  if (!settings) return <Skeleton className="mx-auto h-96 w-full max-w-xl" />;
  return <Form settings={settings} />;
}

function Form({ settings }: { settings: Settings }) {
  const update = useMutation(api.settings.update);
  const [sms, setSms] = useState(settings.enabledChannels.includes("sms"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await update({
        appName: String(form.get("appName")),
        timezone: String(form.get("timezone")).trim(),
        reminderLeadHours: Number(form.get("reminderLeadHours")),
        enabledChannels: sms ? ["sms"] : [],
      });
      toast.success("Ajustes guardados");
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="page-title">Ajustes de la aplicación</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField id="appName" label="Nombre de la aplicación">
              <Input
                id="appName"
                name="appName"
                required
                maxLength={60}
                defaultValue={settings.appName}
              />
            </FormField>
            <FormField
              id="timezone"
              label="Zona horaria"
              hint="Se usa para interpretar y mostrar las fechas límite. Cambiarla no mueve las fechas límite ya guardadas: conservan el mismo instante."
            >
              <Input
                id="timezone"
                name="timezone"
                required
                list="timezones"
                defaultValue={settings.timezone}
                placeholder="Europe/Madrid"
              />
              <datalist id="timezones">
                {timezones.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notificaciones</CardTitle>
            <CardDescription>
              El equipo recibe sus avisos dentro de la aplicación, siempre activos. Los SMS son
              solo para avisar a los clientes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField
              id="reminderLeadHours"
              label="Antelación del recordatorio (horas)"
              hint="Cuánto antes de la fecha límite se avisa a la persona asignada (1–168)."
            >
              <Input
                id="reminderLeadHours"
                name="reminderLeadHours"
                type="number"
                min={1}
                max={168}
                step={1}
                required
                defaultValue={settings.reminderLeadHours}
                className="w-32"
              />
            </FormField>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="sms">SMS a clientes</Label>
                <p className="text-xs text-muted-foreground">
                  Al mover una tarea a un estado marcado «Avisar al cliente» se puede enviar un SMS
                  al cliente. Si lo desactivas, no se envía ningún SMS desde ningún tablero; la
                  llegada estimada se sigue guardando. Cada SMS tiene coste.
                </p>
                <ProviderStatus />
              </div>
              <Switch id="sms" checked={sms} onCheckedChange={setSms} />
            </div>
          </CardContent>
        </Card>

        <FormError message={error} />
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Guardando…" : "Guardar ajustes"}
        </Button>
      </form>
    </div>
  );
}
