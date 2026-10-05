"use client";

import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type CurrentUser = NonNullable<FunctionReturnType<typeof api.users.me>>;

export const CurrentUserContext = createContext<CurrentUser | null>(null);

/** The signed-in user; only usable below <AppShell>. */
export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser must be used inside <AppShell>");
  return user;
}
