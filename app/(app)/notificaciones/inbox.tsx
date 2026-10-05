"use client";

import { useMutation, useQuery } from "convex/react";
import {
  AlarmClockIcon,
  AlertTriangleIcon,
  ArrowRightLeftIcon,
  CheckCheckIcon,
  FlagIcon,
  MessageSquareIcon,
  UserPlusIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useTimezone } from "@/lib/use-app-settings";
import { cn } from "@/lib/utils";

const ICONS: Record<Doc<"notifications">["kind"], typeof UserPlusIcon> = {
  assigned: UserPlusIcon,
  status_changed: ArrowRightLeftIcon,
  stage_reached: FlagIcon,
  commented: MessageSquareIcon,
  deadline_soon: AlarmClockIcon,
  overdue: AlertTriangleIcon,
};

export function Inbox() {
  const router = useRouter();
  const timezone = useTimezone();
  const notifications = useQuery(api.notifications.inbox.list, {});
  const markRead = useMutation(api.notifications.inbox.markRead);
  const markAllRead = useMutation(api.notifications.inbox.markAllRead);
  const hasUnread = notifications?.some((n) => !n.isRead);

  const unread = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title mr-auto">Notificaciones</h1>
        <Button variant="outline" disabled={!hasUnread} onClick={() => void markAllRead({})}>
          <CheckCheckIcon /> Marcar todo como leído
        </Button>
      </div>
      {notifications === undefined ? (
        <Skeleton className="h-64 bg-card" />
      ) : notifications.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-rule bg-card/60 px-6 py-12 text-center text-[1.0625rem] text-muted-foreground">
          No tienes notificaciones.
        </div>
      ) : (
        <section className="overflow-hidden rounded-lg bg-card shadow-[0_1px_2px_rgb(14_21_34/0.06),0_6px_20px_-10px_rgb(14_21_34/0.22)] ring-1 ring-foreground/10">
          {unread > 0 && (
            <p className="flex items-center gap-2 bg-ink px-4 py-2.5 font-label text-[0.875rem] font-semibold tracking-[0.08em] text-ink-foreground uppercase md:px-5">
              Sin leer
              <span className="pass-figure ml-auto text-lg leading-none">{unread}</span>
            </p>
          )}
          <ul className="divide-y divide-border">
            {notifications.map((notification) => {
              const Icon = ICONS[notification.kind];
              const late = notification.kind === "overdue";
              return (
                <li key={notification._id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none md:px-5",
                      !notification.isRead && "bg-accent/45",
                    )}
                    onClick={async () => {
                      await markRead({ notificationId: notification._id });
                      router.push(`/tasks/${notification.taskId}`);
                    }}
                  >
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-md",
                        late
                          ? "bg-alert text-alert-foreground"
                          : notification.isRead
                            ? "bg-panel text-muted-foreground"
                            : "bg-primary text-primary-foreground",
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span
                        className={cn(
                          "text-[1.0625rem] leading-snug",
                          notification.isRead ? "text-foreground/85" : "font-semibold",
                        )}
                      >
                        {notification.text}
                      </span>
                      <span className="pass-figure text-base text-muted-foreground">
                        {new Intl.DateTimeFormat("es-ES", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: timezone,
                        }).format(notification._creationTime)}
                      </span>
                    </span>
                    {!notification.isRead && (
                      <span className="mt-2 size-3 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
