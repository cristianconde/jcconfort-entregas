"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { useHydrated } from "@/lib/use-hydrated";
import { errorMessage } from "@/lib/errors";

export function SetupForm() {
  const bootstrap = useAction(api.accounts.bootstrap);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name"));
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    try {
      await bootstrap({ name, email, password });
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message);
      // Full load so the Convex client picks up the new session token.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload resets the Convex auth token
      window.location.assign("/boards");
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración inicial</CardTitle>
        <CardDescription>
          Crea la cuenta del primer administrador. Después podrás añadir al resto del equipo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* method="post": a submit before hydration must never put credentials in the URL. */}
        <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required autoComplete="name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-alert-soft px-3 py-2.5 text-[0.9375rem] font-medium text-alert-text">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending || !hydrated}>
            {pending ? "Creando…" : "Crear administrador"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
