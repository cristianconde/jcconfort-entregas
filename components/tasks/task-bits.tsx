"use client";

import { AlertTriangleIcon, CheckIcon, UserXIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { formatDeadline } from "@/convex/lib/deadline";
import { PRIORITY_LABELS, type Priority } from "@/lib/labels";
import { cn } from "@/lib/utils";

const CHIP =
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-sm px-2 font-label text-[0.8125rem] leading-none font-semibold tracking-[0.06em] whitespace-nowrap uppercase";

// Only «Urgente» takes the alert red; the rest step down in ink weight.
const PRIORITY_STYLES: Record<Priority, string> = {
  urgente: "bg-alert text-alert-foreground",
  alta: "bg-ink text-ink-foreground",
  media: "border-[1.5px] border-foreground/70 text-foreground",
  baja: "bg-panel text-muted-foreground",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cn(CHIP, PRIORITY_STYLES[priority])}>{PRIORITY_LABELS[priority]}</span>;
}

/** The task's estado, as printed on the pass. */
export function StatusChip({ name, isDone }: { name: string; isDone?: boolean }) {
  return (
    <span
      className={cn(
        CHIP,
        "max-w-full min-w-0",
        isDone ? "border-[1.5px] border-foreground/40 text-muted-foreground" : "bg-panel text-foreground",
      )}
    >
      {isDone && <CheckIcon className="size-3.5 shrink-0" strokeWidth={3} />}
      <span className="truncate">{name}</span>
    </span>
  );
}

export function OverdueChip() {
  return (
    <span className={cn(CHIP, "bg-alert text-alert-foreground")}>
      <AlertTriangleIcon className="size-3.5" strokeWidth={2.5} /> Vencida
    </span>
  );
}

const dayKey = (time: number, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(time);

/**
 * Deadline split for the pass: a day word people read at a glance («Hoy»,
 * «Mañana», «Ayer», else «5 oct») and the time when there is one.
 */
export function deadlineParts(
  deadlineAt: number,
  hasTime: boolean,
  timezone: string,
  now: number,
): { day: string; time?: string } {
  const key = dayKey(deadlineAt, timezone);
  const DAY = 86_400_000;
  let day: string;
  if (key === dayKey(now, timezone)) day = "Hoy";
  else if (key === dayKey(now + DAY, timezone)) day = "Mañana";
  else if (key === dayKey(now - DAY, timezone)) day = "Ayer";
  else {
    const sameYear =
      new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: timezone }).format(deadlineAt) ===
      new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: timezone }).format(now);
    day = new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
      timeZone: timezone,
    })
      .format(deadlineAt)
      .replace(".", "");
  }
  const time = hasTime
    ? new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(
        deadlineAt,
      )
    : undefined;
  return { day, time };
}

/** Deadline as a condensed figure; red when the task is overdue. */
export function DeadlineFigure({
  deadlineAt,
  hasTime,
  isOverdue,
  timezone,
  now,
  className,
}: {
  deadlineAt?: number;
  hasTime: boolean;
  isOverdue: boolean;
  timezone: string;
  now: number;
  className?: string;
}) {
  if (deadlineAt === undefined) {
    return <span className={cn("pass-figure text-lg leading-none text-muted-foreground", className)}>Sin fecha</span>;
  }
  const { day, time } = deadlineParts(deadlineAt, hasTime, timezone, now);
  return (
    <span
      title={formatDeadline(deadlineAt, hasTime, timezone)}
      className={cn(
        "pass-figure inline-flex items-baseline gap-1.5 text-lg leading-none font-semibold uppercase",
        isOverdue ? "text-alert-text" : "text-foreground",
        className,
      )}
    >
      {day}
      {time && <span className={cn(isOverdue ? "text-alert-text" : "text-muted-foreground")}>{time}</span>}
    </span>
  );
}

export function DeadlineLabel({
  deadlineAt,
  hasTime,
  isOverdue,
  timezone,
}: {
  deadlineAt?: number;
  hasTime: boolean;
  isOverdue: boolean;
  timezone: string;
}) {
  if (deadlineAt === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={cn("pass-figure text-[1.0625rem] font-semibold", isOverdue && "text-alert-text")}>
        {formatDeadline(deadlineAt, hasTime, timezone)}
      </span>
      {isOverdue && <OverdueChip />}
    </span>
  );
}

export function AssigneeChip({
  assignee,
  size = "default",
}: {
  assignee?: { name: string; isActive: boolean };
  size?: "default" | "sm";
}) {
  if (!assignee) {
    return (
      <span className={cn(CHIP, "border-[1.5px] border-dashed border-foreground/80 text-foreground")}>
        Sin asignar
      </span>
    );
  }
  if (!assignee.isActive) {
    return (
      <span
        className="inline-flex min-w-0 items-center gap-1.5 text-[0.9375rem] text-muted-foreground"
        title="Asignado a usuario inactivo"
      >
        <UserXIcon className="size-4 shrink-0" />
        <span className="truncate">
          {assignee.name} · Asignado a usuario inactivo
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[0.9375rem] font-medium">
      <Avatar size="sm" className={size === "sm" ? "size-6" : "size-7"}>
        <AvatarFallback className="text-[0.75rem]">{initials(assignee.name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{assignee.name}</span>
    </span>
  );
}
