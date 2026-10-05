"use client";

import { useQuery } from "convex/react";
import { AlertTriangleIcon, ArchiveIcon, KanbanSquareIcon, ListIcon, PlusIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/components/current-user";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { FilterBar } from "@/components/tasks/filter-bar";
import { Kanban } from "@/components/tasks/kanban";
import { TaskDetail } from "@/components/tasks/task-detail";
import { TaskList } from "@/components/tasks/task-list";
import { useBoardUrlState } from "@/components/tasks/use-task-filters";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useTimezone } from "@/lib/use-app-settings";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

export function BoardView({ boardId }: { boardId: Id<"boards"> }) {
  const me = useCurrentUser();
  const now = useNow();
  const timezone = useTimezone();
  const { filters, view, openTaskId, update, activeFilterCount } = useBoardUrlState();
  const [creatingIn, setCreatingIn] = useState<Id<"boardStatuses"> | "default" | null>(null);

  const data = useQuery(api.boards.get, { boardId });
  const tasks = useQuery(api.tasks.listForBoard, {
    boardId,
    now,
    mine: filters.mine || undefined,
    assigneeId: filters.assigneeId,
    unassigned: filters.unassigned || undefined,
    priority: filters.priority,
    overdue: filters.overdue || undefined,
    search: filters.search || undefined,
  });

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-[19.5rem] shrink-0 bg-panel" />
          ))}
        </div>
      </div>
    );
  }
  const readOnly = data.board.isArchived;
  const openTask = (taskId: Id<"tasks">) => update({ task: taskId });

  const doneIds = new Set(data.statuses.filter((st) => st.isDone).map((st) => st._id));
  const openCount = tasks?.filter((t) => !doneIds.has(t.statusId)).length;
  const overdueCount = tasks?.filter((t) => t.isOverdue).length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="mr-auto flex min-w-0 flex-col gap-1.5">
          <h1 className="page-title flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 break-words">{data.board.name}</span>
            {readOnly && (
              <Badge variant="secondary">
                <ArchiveIcon /> Archivado
              </Badge>
            )}
          </h1>
          {openCount !== undefined && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem] text-muted-foreground">
              <span>
                <span className="pass-figure text-lg font-semibold text-foreground">{openCount}</span>{" "}
                {openCount === 1 ? "abierta" : "abiertas"}
              </span>
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-alert-text">
                  <AlertTriangleIcon className="size-4" strokeWidth={2.5} />
                  <span className="pass-figure text-lg font-semibold">{overdueCount}</span>{" "}
                  {overdueCount === 1 ? "vencida" : "vencidas"}
                </span>
              )}
            </p>
          )}
        </div>
        <div
          className="flex rounded-md bg-panel p-1"
          role="group"
          aria-label="Vista"
        >
          {(
            [
              ["kanban", "Tablero", KanbanSquareIcon],
              ["list", "Lista", ListIcon],
            ] as const
          ).map(([mode, label, Icon]) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              aria-pressed={view === mode}
              className={cn(
                "text-muted-foreground",
                view === mode &&
                  "bg-card text-foreground shadow-[0_1px_2px_rgb(14_21_34/0.12)] hover:bg-card",
              )}
              onClick={() => update({ view: mode === "list" ? "list" : null })}
            >
              <Icon /> {label}
            </Button>
          ))}
        </div>
        {me.role === "admin" && (
          <Button
            variant="outline"
            size="sm"
            className="h-11"
            nativeButton={false}
            render={<Link href={`/boards/${boardId}/settings`} />}
          >
            <SettingsIcon /> Ajustes
          </Button>
        )}
        {!readOnly && (
          <Button
            onClick={() => setCreatingIn("default")}
            className="fixed right-4 bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+1rem)] z-30 h-14 px-5 text-[1.0625rem] shadow-[0_10px_24px_-8px_rgb(13_64_155/0.7)] md:static md:h-11 md:px-4 md:text-base md:shadow-[0_1px_2px_rgb(14_21_34/0.18)]"
          >
            <PlusIcon /> Nueva tarea
          </Button>
        )}
      </div>

      <FilterBar
        filters={filters}
        members={data.members.map(({ _id, name }) => ({ _id, name }))}
        activeCount={activeFilterCount}
        update={update}
      />

      {tasks === undefined ? (
        <Skeleton className="h-72 bg-panel" />
      ) : view === "kanban" ? (
        <Kanban
          statuses={data.statuses}
          tasks={tasks}
          timezone={timezone}
          now={now}
          readOnly={readOnly}
          customerSmsAvailable={data.customerSmsAvailable}
          onOpenTask={openTask}
          onCreateIn={(statusId) => setCreatingIn(statusId)}
        />
      ) : (
        <TaskList
          statuses={data.statuses}
          tasks={tasks}
          timezone={timezone}
          now={now}
          onOpenTask={openTask}
        />
      )}

      {creatingIn && (
        <CreateTaskDialog
          boardId={boardId}
          statuses={data.statuses}
          defaultStatusId={creatingIn === "default" ? undefined : creatingIn}
          onClose={() => setCreatingIn(null)}
        />
      )}

      <Sheet open={openTaskId !== null} onOpenChange={(open) => !open && update({ task: null })}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:max-w-none sm:max-w-xl data-[side=right]:sm:max-w-xl">
          <SheetHeader className="sr-only">
            <SheetTitle>Detalle de la tarea</SheetTitle>
          </SheetHeader>
          {openTaskId && (
            <TaskDetail taskId={openTaskId} onDeleted={() => update({ task: null })} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
