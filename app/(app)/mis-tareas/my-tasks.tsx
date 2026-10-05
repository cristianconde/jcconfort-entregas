"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DepartureGroup,
  DepartureRow,
  DeparturesBoard,
  DeparturesEmpty,
} from "@/components/tasks/departures";
import { deadlineParts } from "@/components/tasks/task-bits";
import { api } from "@/convex/_generated/api";
import { useTimezone } from "@/lib/use-app-settings";
import { useNow } from "@/lib/use-now";

type Row = FunctionReturnType<typeof api.tasks.myOpen>[number];

const GROUPS = [
  { key: "late", label: "Vencidas", tone: "late" },
  { key: "today", label: "Hoy", tone: "now" },
  { key: "tomorrow", label: "Mañana", tone: "plain" },
  { key: "later", label: "Próximas", tone: "plain" },
  { key: "none", label: "Sin fecha", tone: "plain" },
] as const;

type GroupKey = (typeof GROUPS)[number]["key"];

/** One time axis: everything above HOY is late. Rows arrive sorted by deadline. */
function groupOf(row: Row, timezone: string, now: number): GroupKey {
  const { task } = row;
  if (task.isOverdue) return "late";
  if (task.deadlineAt === undefined) return "none";
  const { day } = deadlineParts(task.deadlineAt, task.deadlineHasTime, timezone, now);
  if (day === "Hoy") return "today";
  if (day === "Mañana") return "tomorrow";
  return "later";
}

export function MyTasks() {
  const now = useNow();
  const timezone = useTimezone();
  const rows = useQuery(api.tasks.myOpen, { now });

  const clock = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(now);
  const today = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(now);

  const grouped = new Map<GroupKey, Row[]>(GROUPS.map((g) => [g.key, []]));
  for (const row of rows ?? []) grouped.get(groupOf(row, timezone, now))!.push(row);
  const lateCount = grouped.get("late")!.length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <h1 className="page-title mr-auto">Mis tareas</h1>
        <p className="text-[0.9375rem] text-muted-foreground first-letter:uppercase">{today}</p>
      </div>

      {rows === undefined ? (
        <Skeleton className="h-80 bg-panel" />
      ) : (
        <DeparturesBoard
          title={
            rows.length === 0
              ? "Nada pendiente"
              : `${rows.length} ${rows.length === 1 ? "abierta" : "abiertas"}`
          }
          aside={
            <>
              {lateCount > 0 && (
                <span className="inline-flex h-8 items-center rounded-sm bg-alert px-2 font-label text-[0.875rem] font-semibold tracking-[0.06em] uppercase">
                  {lateCount} {lateCount === 1 ? "vencida" : "vencidas"}
                </span>
              )}
              <time
                dateTime={new Date(now).toISOString()}
                className="pass-figure text-2xl leading-none font-semibold"
                aria-label={`Hora actual ${clock}`}
              >
                {clock}
              </time>
            </>
          }
          columns={["Vence", "Tarea", "Tablero", "Prioridad", "Estado"]}
        >
          {rows.length === 0 ? (
            <DeparturesEmpty>No tienes tareas abiertas asignadas.</DeparturesEmpty>
          ) : (
            GROUPS.flatMap((group) => {
              const list = grouped.get(group.key)!;
              if (list.length === 0) return [];
              return [
                <DepartureGroup
                  key={group.key}
                  label={group.label}
                  count={list.length}
                  tone={group.tone}
                />,
                ...list.map(({ task, boardName, statusName }) => (
                  <DepartureRow
                    key={task._id}
                    task={task}
                    timezone={timezone}
                    now={now}
                    statusName={statusName}
                    context={boardName}
                    href={`/boards/${task.boardId}?task=${task._id}`}
                  />
                )),
              ];
            })
          )}
        </DeparturesBoard>
      )}
    </div>
  );
}
