"use client";

import { useCurrentUser } from "@/components/current-user";
import { NoAccess } from "@/components/no-access";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = useCurrentUser();
  if (me.role !== "admin") return <NoAccess />;
  return children;
}
