"use client";

import { AlertTriangleIcon, ChevronRightIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Priority } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { AssigneeChip, DeadlineFigure, PriorityBadge, StatusChip, deadlineParts } from "./task-bits";

/*
 * The departures board: every list of tasks reads like a gate board. Rows keep
 * fixed columns on wide screens and fold to "when | what" on phones; groups are
 * separated by full-width rules (VENCIDAS in red, HOY in ink).
 */

export function DeparturesBoard({
  title,
  aside,
  columns,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  /** Five column captions for wide screens, matching DepartureRow's grid. */
  columns: [string, string, string, string, string];
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-card shadow-[0_1px_2px_rgb(14_21_34/0.06),0_6px_20px_-10px_rgb(14_21_34/0.22)] ring-1 ring-foreground/10">
      <header className="flex min-h-14 items-center gap-3 bg-ink px-4 text-ink-foreground md:px-5">
        <h2 className="min-w-0 truncate font-display text-xl leading-none font-bold tracking-[0.04em] uppercase">
          {title}
        </h2>
        {aside && <div className="ml-auto flex shrink-0 items-center gap-3">{aside}</div>}
      </header>
      <div
        aria-hidden
        className="hidden border-b border-border bg-muted px-5 py-2 md:grid md:grid-cols-(--departure-cols) md:gap-4"
        style={COLS}
      >
        {columns.map((column) => (
          <span key={column} className="pass-label">
            {column}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

// VENCE | TAREA | tablero or persona | PRIORIDAD | ESTADO | chevron.
const COLS = {
  "--departure-cols": "8.5rem minmax(0,1fr) 11rem 7rem 10rem 1.25rem",
} as React.CSSProperties;

export function DepartureGroup({
  label,
  count,
  tone = "plain",
}: {
  label: string;
  count: number;
  tone?: "plain" | "late" | "now";
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 px-4 py-2 md:px-5",
        tone === "late" && "bg-alert text-alert-foreground",
        tone === "now" && "bg-ink/90 text-ink-foreground",
        tone === "plain" && "bg-panel text-foreground",
      )}
    >
      {tone === "late" && <AlertTriangleIcon className="size-4" strokeWidth={2.5} />}
      <span className="font-label text-[0.875rem] font-semibold tracking-[0.1em] uppercase">{label}</span>
      <span className="pass-figure ml-auto text-lg leading-none font-semibold">{count}</span>
    </li>
  );
}

type RowTask = {
  title: string;
  priority: Priority;
  deadlineAt?: number;
  deadlineHasTime: boolean;
  isOverdue: boolean;
  commentCount?: number;
  assignee?: { name: string; isActive: boolean };
};

export function DepartureRow({
  task,
  timezone,
  now,
  statusName,
  statusDone,
  context,
  showAssignee,
  href,
  onOpen,
}: {
  task: RowTask;
  timezone: string;
  now: number;
  statusName: string;
  statusDone?: boolean;
  /** Board name on Mis tareas. */
  context?: string;
  showAssignee?: boolean;
  href?: string;
  onOpen?: () => void;
}) {
  const loud = task.priority === "urgente" || task.priority === "alta";
  const when =
    task.deadlineAt !== undefined
      ? deadlineParts(task.deadlineAt, task.deadlineHasTime, timezone, now)
      : undefined;

  const inner = (
    <>
      {/* Phone: when | what. */}
      <div className="flex w-[4.75rem] shrink-0 flex-col gap-0.5 md:hidden">
        {when ? (
          <>
            <span
              className={cn(
                "pass-figure text-xl leading-none font-bold uppercase",
                task.isOverdue ? "text-alert-text" : "text-foreground",
              )}
            >
              {when.day}
            </span>
            {when.time && (
              <span
                className={cn(
                  "pass-figure text-lg leading-none font-medium",
                  task.isOverdue ? "text-alert-text" : "text-muted-foreground",
                )}
              >
                {when.time}
              </span>
            )}
          </>
        ) : (
          <span className="pass-figure text-lg leading-tight text-muted-foreground">Sin fecha</span>
        )}
      </div>
      <div className="hidden md:block">
        <DeadlineFigure
          deadlineAt={task.deadlineAt}
          hasTime={task.deadlineHasTime}
          isOverdue={task.isOverdue}
          timezone={timezone}
          now={now}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[1.0625rem] leading-snug font-semibold text-pretty">{task.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.9375rem] text-muted-foreground md:hidden">
          <StatusChip name={statusName} isDone={statusDone} />
          {loud && <PriorityBadge priority={task.priority} />}
          {context && <span className="min-w-0 truncate">{context}</span>}
          {showAssignee && <AssigneeChip assignee={task.assignee} size="sm" />}
        </span>
        {!!task.commentCount && (
          <span className="pass-figure inline-flex items-center gap-1 text-base text-muted-foreground md:hidden">
            <MessageSquareIcon className="size-4" /> {task.commentCount}
          </span>
        )}
      </div>

      <span className="hidden min-w-0 md:block">
        {showAssignee ? (
          <AssigneeChip assignee={task.assignee} size="sm" />
        ) : (
          <span className="block truncate text-[0.9375rem] text-muted-foreground">{context}</span>
        )}
      </span>
      <span className="hidden md:block">
        <PriorityBadge priority={task.priority} />
      </span>
      <span className="hidden min-w-0 md:block">
        <StatusChip name={statusName} isDone={statusDone} />
      </span>
      <ChevronRightIcon className="size-5 shrink-0 self-center text-muted-foreground" />
    </>
  );

  const className =
    "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none md:grid md:grid-cols-(--departure-cols) md:items-center md:gap-4 md:px-5";

  return (
    <li className={cn(task.isOverdue && "bg-alert-soft/60")}>
      {href ? (
        <Link href={href} className={className} style={COLS}>
          {inner}
        </Link>
      ) : (
        <button type="button" className={className} style={COLS} onClick={onOpen}>
          {inner}
        </button>
      )}
    </li>
  );
}

export function DeparturesEmpty({ children }: { children: ReactNode }) {
  return (
    <li className="px-5 py-12 text-center text-[1.0625rem] text-muted-foreground">{children}</li>
  );
}
