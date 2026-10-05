"use client";

import type { Id } from "@/convex/_generated/dataModel";
import type { TaskCard } from "./kanban";
import { DepartureGroup, DepartureRow, DeparturesBoard, DeparturesEmpty } from "./departures";

/** Tasks grouped by status order, then soonest deadline (none last). */
export function TaskList({
  statuses,
  tasks,
  timezone,
  now,
  onOpenTask,
}: {
  statuses: { _id: Id<"boardStatuses">; name: string; isDone: boolean }[];
  tasks: TaskCard[];
  timezone: string;
  now: number;
  onOpenTask: (taskId: Id<"tasks">) => void;
}) {
  const byStatus = new Map(statuses.map((s) => [s._id, [] as TaskCard[]]));
  for (const task of tasks) byStatus.get(task.statusId)?.push(task);
  for (const list of byStatus.values()) {
    list.sort(
      (a, b) => (a.deadlineAt ?? Infinity) - (b.deadlineAt ?? Infinity) || a.order - b.order,
    );
  }

  return (
    <DeparturesBoard
      title={`${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}`}
      columns={["Vence", "Tarea", "Asignada a", "Prioridad", "Estado"]}
    >
      {tasks.length === 0 ? (
        <DeparturesEmpty>No hay tareas que coincidan con los filtros.</DeparturesEmpty>
      ) : (
        statuses.flatMap((status) => {
          const list = byStatus.get(status._id) ?? [];
          if (list.length === 0) return [];
          return [
            <DepartureGroup key={status._id} label={status.name} count={list.length} />,
            ...list.map((task) => (
              <DepartureRow
                key={task._id}
                task={task}
                timezone={timezone}
                now={now}
                statusName={status.name}
                statusDone={status.isDone}
                showAssignee
                onOpen={() => onOpenTask(task._id)}
              />
            )),
          ];
        })
      )}
    </DeparturesBoard>
  );
}
