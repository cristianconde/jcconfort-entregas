"use client";

import { useQuery } from "convex/react";
import { BellIcon } from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";

export function useUnreadCount(): number {
  return useQuery(api.notifications.inbox.unreadCount, {}) ?? 0;
}

export function unreadLabel(unread: number) {
  return unread === 0 ? "Notificaciones" : `Notificaciones (${unread} sin leer)`;
}

/** Count chip shared by the header bell and the phone tab bar. */
export function UnreadCount({ unread, className }: { unread: number; className?: string }) {
  if (unread === 0) return null;
  return (
    <span
      aria-hidden
      className={`pass-figure inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-alert px-1 text-[0.8125rem] leading-none font-bold text-alert-foreground ${className ?? ""}`}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

/** App-bar bell (desktop) with a live unread count; links to the inbox. */
export function NotificationBell() {
  const unread = useUnreadCount();
  return (
    <Link
      href="/notificaciones"
      aria-label={unreadLabel(unread)}
      className="relative inline-flex size-11 items-center justify-center rounded-md text-primary-foreground/90 transition-colors hover:bg-white/12 hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
    >
      <BellIcon className="size-5" />
      <UnreadCount unread={unread} className="absolute top-1 right-0.5 ring-2 ring-primary" />
    </Link>
  );
}
