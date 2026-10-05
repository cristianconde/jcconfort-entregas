"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangleIcon, CheckIcon, MessageSquareIcon, PlusIcon, TruckIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { arrivalLabel, etaOf } from "@/convex/lib/customerMessage";
import { cn } from "@/lib/utils";
import { useMoveWithNotice, type NoticeStatus } from "./customer-notice-dialog";
import { AssigneeChip, DeadlineFigure, PriorityBadge } from "./task-bits";

export type TaskCard = FunctionReturnType<typeof api.tasks.listForBoard>[number];
type Status = NoticeStatus & { isDone: boolean };

const STEP = 1024;

/** Fractional order between two neighbours (either may be missing). */
function orderBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return STEP;
  if (before === undefined) return after! - STEP;
  if (after === undefined) return before + STEP;
  return (before + after) / 2;
}

export function Kanban({
  statuses,
  tasks,
  timezone,
  now,
  readOnly,
  customerSmsAvailable,
  onOpenTask,
  onCreateIn,
}: {
  statuses: Status[];
  tasks: TaskCard[];
  timezone: string;
  now: number;
  readOnly: boolean;
  customerSmsAvailable: boolean;
  onOpenTask: (taskId: Id<"tasks">) => void;
  onCreateIn: (statusId: Id<"boardStatuses">) => void;
}) {
  const { requestMove, dialog: noticeDialog, pending: pendingMove } = useMoveWithNotice(
    statuses,
    customerSmsAvailable,
  );
  const [activeId, setActiveId] = useState<Id<"tasks"> | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(() => {
    const byStatus = new Map<Id<"boardStatuses">, TaskCard[]>(statuses.map((s) => [s._id, []]));
    for (const task of tasks) {
      // A move waiting for the "Aviso al cliente" confirmation shows as a ghost
      // in its target lane; the move itself is only applied on confirm.
      const shown =
        pendingMove?.task._id === task._id
          ? { ...task, statusId: pendingMove.status._id, order: pendingMove.order ?? Infinity }
          : task;
      byStatus.get(shown.statusId)?.push(shown);
    }
    for (const list of byStatus.values()) list.sort((a, b) => a.order - b.order);
    return byStatus;
  }, [statuses, tasks, pendingMove]);

  const activeTask = activeId ? tasks.find((t) => t._id === activeId) : undefined;

  // Phones show one lane per screen; the chips above jump between them and
  // follow whichever lane is in view.
  const railRef = useRef<HTMLDivElement>(null);
  const [visibleLane, setVisibleLane] = useState<Id<"boardStatuses"> | null>(statuses[0]?._id ?? null);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setVisibleLane((best.target as HTMLElement).dataset.lane as Id<"boardStatuses">);
      },
      { root: rail, threshold: [0.6] },
    );
    rail.querySelectorAll<HTMLElement>("[data-lane]").forEach((lane) => observer.observe(lane));
    return () => observer.disconnect();
  }, [statuses]);

  function jumpTo(statusId: Id<"boardStatuses">, behavior: ScrollBehavior = "smooth") {
    const rail = railRef.current;
    const lane = rail?.querySelector<HTMLElement>(`[data-lane="${statusId}"]`);
    if (rail && lane) rail.scrollTo({ left: lane.offsetLeft - rail.offsetLeft - 16, behavior });
  }

  // On phones, open on the first lane that has work in it rather than an
  // empty first column. Once per board visit.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !window.matchMedia("(max-width: 39.99rem)").matches) return;
    const first = statuses.find((s) => (columns.get(s._id)?.length ?? 0) > 0);
    if (!first) return;
    landed.current = true;
    jumpTo(first._id, "instant");
  }, [statuses, columns]);

  function onDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as Id<"tasks">);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const task = tasks.find((t) => t._id === active.id);
    if (!task) return;

    // `over` is either a column (dropped on empty space) or another card.
    const overTask = tasks.find((t) => t._id === over.id);
    const targetStatusId = (overTask?.statusId ?? over.id) as Id<"boardStatuses">;
    const column = columns.get(targetStatusId);
    if (!column) return;

    let ids = column.map((t) => t._id);
    if (task.statusId === targetStatusId) {
      const from = ids.indexOf(task._id);
      const to = overTask ? ids.indexOf(overTask._id) : ids.length - 1;
      if (from === to) return;
      ids = arrayMove(ids, from, to);
    } else {
      const at = overTask ? ids.indexOf(overTask._id) : ids.length;
      ids.splice(at, 0, task._id);
    }
    const index = ids.indexOf(task._id);
    const orderOf = (id?: Id<"tasks">) => column.find((t) => t._id === id)?.order;
    const order = orderBetween(orderOf(ids[index - 1]), orderOf(ids[index + 1]));

    requestMove(task, targetStatusId, order);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        role="tablist"
        aria-label="Ir a un estado"
        className="-mx-4 -mt-1 flex gap-2 overflow-x-auto px-4 pb-1 sm:hidden"
      >
        {statuses.map((status) => {
          const count = columns.get(status._id)?.length ?? 0;
          const late = columns.get(status._id)?.filter((t) => t.isOverdue).length ?? 0;
          const active = visibleLane === status._id;
          return (
            <button
              key={status._id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => jumpTo(status._id)}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-md border-[1.5px] px-3 font-label text-[0.875rem] font-semibold tracking-[0.05em] uppercase transition-colors",
                active ? "border-ink bg-ink text-ink-foreground" : "border-rule bg-card text-foreground",
              )}
            >
              {status.name}
              <span className="pass-figure text-base">{count}</span>
              {late > 0 && (
                <span
                  aria-label={`${late} ${late === 1 ? "vencida" : "vencidas"}`}
                  className="pass-figure inline-flex h-6 items-center gap-0.5 rounded-sm bg-alert px-1.5 text-base text-alert-foreground"
                >
                  <AlertTriangleIcon className="size-3.5" strokeWidth={2.5} />
                  {late}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        ref={railRef}
        className="lane-rail -mx-4 flex flex-1 items-start gap-3 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6"
      >
        {statuses.map((status) => (
          <Column
            key={status._id}
            status={status}
            tasks={columns.get(status._id) ?? []}
            timezone={timezone}
            now={now}
            readOnly={readOnly}
            ghostId={pendingMove?.task._id}
            onOpenTask={onOpenTask}
            onCreate={() => onCreateIn(status._id)}
          />
        ))}
      </div>
      {/* No drop animation into the confirmation: the card is already a ghost in its target lane. */}
      <DragOverlay dropAnimation={pendingMove ? null : undefined}>
        {activeTask && <CardBody task={activeTask} timezone={timezone} now={now} dragging />}
      </DragOverlay>
      {noticeDialog}
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  timezone,
  now,
  readOnly,
  ghostId,
  onOpenTask,
  onCreate,
}: {
  status: Status;
  tasks: TaskCard[];
  timezone: string;
  now: number;
  readOnly: boolean;
  ghostId?: Id<"tasks">;
  onOpenTask: (taskId: Id<"tasks">) => void;
  onCreate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status._id, disabled: readOnly });
  const overdue = tasks.filter((t) => t.isOverdue).length;
  return (
    <section
      aria-label={status.name}
      data-lane={status._id}
      className="flex w-[calc(100vw-3.5rem)] max-w-[23rem] shrink-0 snap-start flex-col overflow-hidden rounded-lg bg-panel sm:w-[19.5rem] lg:w-auto lg:max-w-[26rem] lg:min-w-[16.5rem] lg:flex-1"
    >
      <header className="flex min-h-14 items-center gap-2.5 bg-ink py-2 pr-2 pl-4 text-ink-foreground">
        <h2 className="min-w-0 truncate font-display text-xl leading-none font-bold tracking-[0.03em] uppercase">
          {status.name}
        </h2>
        {status.isDone && <CheckIcon aria-label="Estado final" className="size-5 shrink-0 opacity-80" strokeWidth={2.5} />}
        <span className="pass-figure hidden h-7 min-w-7 shrink-0 items-center justify-center rounded-sm bg-white/14 px-1.5 text-lg font-semibold sm:inline-flex">
          {tasks.length}
        </span>
        {overdue > 0 && (
          <span
            className="hidden h-7 shrink-0 items-center gap-1 rounded-sm bg-alert px-1.5 font-display text-lg font-semibold sm:inline-flex"
            title={`${overdue} ${overdue === 1 ? "vencida" : "vencidas"}`}
          >
            <AlertTriangleIcon className="size-4" strokeWidth={2.5} />
            {overdue}
          </span>
        )}
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-ink-foreground hover:bg-white/12 hover:text-ink-foreground"
            aria-label={`Nueva tarea en ${status.name}`}
            onClick={onCreate}
          >
            <PlusIcon />
          </Button>
        )}
      </header>
      <SortableContext items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-32 flex-1 flex-col gap-3 p-2.5 transition-colors duration-150",
            isOver && "bg-accent shadow-[inset_0_0_0_2px_var(--primary)]",
          )}
        >
          {tasks.map((task) => (
            <SortableCard
              key={task._id}
              task={task}
              timezone={timezone}
              now={now}
              readOnly={readOnly}
              ghost={task._id === ghostId}
              onOpen={() => onOpenTask(task._id)}
            />
          ))}
          {tasks.length === 0 && (
            <p className="flex flex-1 items-center justify-center rounded-md border-2 border-dashed border-rule px-3 py-6 text-center text-[0.9375rem] text-muted-foreground">
              Sin tareas
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({
  task,
  timezone,
  now,
  readOnly,
  ghost,
  onOpen,
}: {
  task: TaskCard;
  timezone: string;
  now: number;
  readOnly: boolean;
  ghost: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task._id,
    disabled: readOnly || ghost,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-md outline-none focus-visible:ring-3 focus-visible:ring-primary/60",
        isDragging && "opacity-35",
        ghost && "opacity-55 outline-2 outline-offset-2 outline-primary outline-dashed",
      )}
      aria-busy={ghost || undefined}
      {...attributes}
      {...listeners}
      // dnd-kit's attributes make this focusable; Enter opens the task.
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
        listeners?.onKeyDown?.(event);
      }}
      onClick={onOpen}
      aria-label={`Tarea: ${task.title}`}
    >
      <CardBody task={task} timezone={timezone} now={now} />
    </div>
  );
}

/** A task as a pass: head (priority, title), tear line, stub (who, when). */
export function CardBody({
  task,
  timezone,
  now,
  dragging,
}: {
  task: TaskCard;
  timezone: string;
  now: number;
  dragging?: boolean;
}) {
  const loud = task.priority === "urgente" || task.priority === "alta";
  const eta = task.isOpen ? etaOf(task) : undefined;
  return (
    <article
      className={cn(
        "cursor-pointer overflow-hidden rounded-md bg-card text-left shadow-[0_1px_2px_rgb(14_21_34/0.08),0_3px_10px_-6px_rgb(14_21_34/0.18)] ring-1 ring-foreground/10 transition-[box-shadow,transform] duration-150 [--notch:var(--panel)] hover:-translate-y-px hover:shadow-[0_2px_4px_rgb(14_21_34/0.08),0_10px_22px_-10px_rgb(14_21_34/0.35)]",
        dragging && "rotate-[1.5deg] shadow-[0_18px_40px_-12px_rgb(14_21_34/0.5)]",
      )}
    >
      {task.isOverdue && (
        <p className="flex items-center gap-1.5 bg-alert px-3.5 py-1 font-label text-[0.8125rem] font-semibold tracking-[0.08em] text-alert-foreground uppercase">
          <AlertTriangleIcon className="size-3.5" strokeWidth={2.5} /> Vencida
        </p>
      )}
      <div className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5">
        {(loud || task.commentCount > 0) && (
          <div className="flex items-center gap-2">
            {loud && <PriorityBadge priority={task.priority} />}
            {task.commentCount > 0 && (
              <span
                className="pass-figure ml-auto inline-flex items-center gap-1 text-base text-muted-foreground"
                aria-label={`${task.commentCount} comentarios`}
              >
                <MessageSquareIcon className="size-4" />
                {task.commentCount}
              </span>
            )}
          </div>
        )}
        <p className="text-[1.0625rem] leading-snug font-semibold text-pretty">{task.title}</p>
      </div>
      <div className="pass-tear" aria-hidden />
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3.5 pt-2.5 pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="pass-label">Asignada a</dt>
          <dd className="min-w-0">
            <AssigneeChip assignee={task.assignee} size="sm" />
          </dd>
        </div>
        <div className="flex flex-col items-end gap-1 border-l border-border pl-3">
          <dt className="pass-label">Vence</dt>
          <dd>
            <DeadlineFigure
              deadlineAt={task.deadlineAt}
              hasTime={task.deadlineHasTime}
              isOverdue={task.isOverdue}
              timezone={timezone}
              now={now}
              className="text-[1.0625rem]"
            />
          </dd>
        </div>
      </dl>
      {eta && (
        <p className="flex items-center gap-1.5 border-t border-border px-3.5 py-2 text-[0.9375rem]">
          <TruckIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="pass-label">Llegada:</span>
          <span className="pass-figure text-[1.0625rem] leading-none font-semibold">
            {arrivalLabel(eta, timezone, now)}
          </span>
        </p>
      )}
    </article>
  );
}
