import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { isAuthenticated } from "@/lib/auth-server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage() {
  const { needsSetup } = await fetchQuery(api.accounts.bootstrapStatus, {});
  if (needsSetup) redirect("/setup");
  if (await isAuthenticated()) redirect("/boards");
  const { appName } = await fetchQuery(api.settings.publicInfo, {});
  return <LoginForm appName={appName} />;
}
