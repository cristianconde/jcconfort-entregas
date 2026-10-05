"use client";

import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// @convex-dev/better-auth@0.12's structural AuthClient type resolves
// useSession().data to `never` against better-auth 1.6.33; runtime is compatible.
const providerAuthClient = authClient as unknown as AuthClient;

export function Providers({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  return (
    <ConvexBetterAuthProvider client={convex} authClient={providerAuthClient} initialToken={initialToken}>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster richColors position="top-center" />
    </ConvexBetterAuthProvider>
  );
}
