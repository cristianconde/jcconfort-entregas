import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Configuración inicial" };

export default async function SetupPage() {
  const { needsSetup } = await fetchQuery(api.accounts.bootstrapStatus, {});
  if (!needsSetup) redirect("/login");
  return <SetupForm />;
}
