"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const FALLBACK_TIMEZONE = "Europe/Madrid";

/** App timezone for interpreting and displaying deadlines. */
export function useTimezone(): string {
  return useQuery(api.settings.get, {})?.timezone ?? FALLBACK_TIMEZONE;
}
