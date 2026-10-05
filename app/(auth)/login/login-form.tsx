"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useHydrated } from "@/lib/use-hydrated";

const DEACTIVATED = "Tu cuenta está desactivada";

export function LoginForm({ appName }: { appName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    if (error) {
      // Never reveal whether the email exists; only surface deactivation.
      setError(error.message === DEACTIVATED ? DEACTIVATED : "Email o contraseña incorrectos");
      setPending(false);
      return;
    }
    // Full load so the Convex client picks up the new session token.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload resets the Convex auth token
    window.location.assign("/boards");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{appName}</CardTitle>
        <CardDescription>Inicia sesión para ver las tareas de tu equipo.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* method="post": a submit before hydration must never put credentials in the URL. */}
        <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
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
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-alert-soft px-3 py-2.5 text-[0.9375rem] font-medium text-alert-text">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending || !hydrated}>
            {pending ? "Entrando…" : "Iniciar sesión"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
