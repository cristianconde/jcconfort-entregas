"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  CheckIcon,
  MessageSquareTextIcon,
  PencilIcon,
  PhoneIcon,
  Trash2Icon,
  TruckIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { arrivalLabel, etaOf } from "@/convex/lib/customerMessage";
import { formatDeadline, fromDeadlineAt } from "@/convex/lib/deadline";
import { phoneError } from "@/convex/lib/validation";
import { describeActivity } from "@/lib/describe-activity";
import { errorMessage } from "@/lib/errors";
import { PRIORITY_ITEMS, type Priority } from "@/lib/labels";
import { useTimezone } from "@/lib/use-app-settings";
import { useNow } from "@/lib/use-now";
import { useMoveWithNotice, type NoticeStatus } from "./customer-notice-dialog";
import { DeadlineInputs } from "./deadline-inputs";
import { deadlineParts } from "./task-bits";
import { cn } from "@/lib/utils";

const UNASSIGNED = "__none__";

function formatWhen(time: number, timezone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(time);
}

/** Runs a mutation and reports failures as a toast. */
async function safe(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

export function TaskDetail({
  taskId,
  onDeleted,
}: {
  taskId: Id<"tasks">;
  onDeleted: () => void;
}) {
  const now = useNow();
  const timezone = useTimezone();
  const data = useQuery(api.tasks.get, { taskId, now });
  const board = useQuery(api.boards.get, data ? { boardId: data.task.boardId } : "skip");

  if (!data || !board) {
    return (
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <Skeleton className="h-16 bg-primary/30" />
        <Skeleton className="h-28 bg-card" />
        <Skeleton className="h-48 bg-card" />
      </div>
    );
  }
  const readOnly = data.boardArchived;
  const { task } = data;

  return (
    <div className="flex flex-col gap-4 p-3 pb-10 sm:p-4">
      <article className="overflow-hidden rounded-lg bg-card shadow-[0_1px_2px_rgb(14_21_34/0.06),0_8px_24px_-12px_rgb(14_21_34/0.3)] ring-1 ring-foreground/10 [--notch:var(--background)]">
        <header className="flex min-h-16 items-center gap-2 bg-primary py-3 pr-16 pl-4 text-primary-foreground sm:pl-5">
          <span className="min-w-0 truncate font-display text-xl leading-none font-bold tracking-[0.03em] uppercase">
            {data.boardName}
          </span>
          {readOnly && (
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-sm bg-white/15 px-2 font-label text-[0.8125rem] font-semibold tracking-[0.06em] uppercase">
              <ArchiveIcon className="size-3.5" /> Solo lectura
            </span>
          )}
        </header>
        {task.isOverdue && (
          <p className="flex items-center gap-2 bg-alert px-4 py-2.5 font-label text-[0.9375rem] font-semibold tracking-[0.06em] text-alert-foreground uppercase sm:px-5">
            <AlertTriangleIcon className="size-4" strokeWidth={2.5} /> Vencida
            {task.deadlineAt !== undefined && (() => {
              const { day, time } = deadlineParts(task.deadlineAt, task.deadlineHasTime, timezone, now);
              return (
                <span
                  className="pass-figure ml-auto text-[1.75rem] leading-none font-bold tracking-normal"
                  title={formatDeadline(task.deadlineAt, task.deadlineHasTime, timezone)}
                >
                  {day}
                  {time && <> {time}</>}
                </span>
              );
            })()}
          </p>
        )}
        <TaskFields
          key={task._id}
          data={data}
          statuses={board.statuses}
          customerSmsAvailable={board.customerSmsAvailable}
          timezone={timezone}
          now={now}
          readOnly={readOnly}
        />
        <p className="border-t border-border bg-muted/70 px-4 py-2.5 text-[0.875rem] text-muted-foreground sm:px-5">
          Creada por <span className="font-medium text-foreground">{task.creatorName}</span> el{" "}
          {formatWhen(task._creationTime, timezone)}
          {task.completedAt && <> · completada el {formatWhen(task.completedAt, timezone)}</>}
          {readOnly && " · tablero archivado (solo lectura)"}
        </p>
      </article>
      <Comments taskId={taskId} timezone={timezone} readOnly={readOnly} />
      <ActivityLog taskId={taskId} timezone={timezone} />
      {data.canDelete && !readOnly && (
        <DeleteTask taskId={taskId} title={task.title} onDeleted={onDeleted} />
      )}
    </div>
  );
}

type TaskData = FunctionReturnType<typeof api.tasks.get>;

function TaskFields({
  data,
  statuses,
  customerSmsAvailable,
  timezone,
  now,
  readOnly,
}: {
  data: TaskData;
  statuses: (NoticeStatus & { isDone: boolean })[];
  customerSmsAvailable: boolean;
  timezone: string;
  now: number;
  readOnly: boolean;
}) {
  const { task } = data;
  const update = useMutation(api.tasks.update);
  const assign = useMutation(api.tasks.assign);
  // Statuses marked "Avisar al cliente" ask for the confirmation before moving.
  const { requestMove, dialog: noticeDialog, pending: pendingMove } = useMoveWithNotice(
    statuses,
    customerSmsAvailable,
  );
  const eta = task.isOpen ? etaOf(task) : undefined;
  const members = useQuery(api.boards.assignableMembers, { boardId: task.boardId }) ?? [];

  const assigneeItems = [
    { value: UNASSIGNED, label: "Sin asignar" },
    ...members.map((m) => ({ value: m._id, label: m.name })),
    // Keep a deactivated assignee visible in the picker (not selectable anew).
    ...(task.assignee && !task.assignee.isActive
      ? [{ value: task.assignee._id, label: `${task.assignee.name} (inactivo)` }]
      : []),
  ];
  const deadline =
    task.deadlineAt !== undefined
      ? fromDeadlineAt(task.deadlineAt, task.deadlineHasTime, timezone)
      : null;

  return (
    <>
      <div className="px-4 pt-4 pb-5 sm:px-5">
        <Textarea
          // Keyed on the value so edits by other users show up live.
          key={task.title}
          aria-label="Título"
          defaultValue={task.title}
          maxLength={200}
          rows={1}
          disabled={readOnly}
          className="-mx-2 min-h-0 w-[calc(100%+1rem)] resize-none border-transparent bg-transparent px-2 py-1 text-[1.5rem] leading-tight font-bold shadow-none hover:border-input disabled:opacity-100"
          // A title is one line: Enter saves instead of adding a line break.
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onBlur={(event) => {
            const title = event.target.value;
            if (title.trim() !== task.title) void safe(() => update({ taskId: task._id, title }));
          }}
        />
      </div>

      <div className="pass-tear" aria-hidden />

      <fieldset className="flex min-w-0 flex-col gap-2.5 px-4 pt-4 pb-5 sm:px-5" disabled={readOnly}>
        <legend className="pass-label float-left mb-2.5 w-full">Estado</legend>
        <div role="radiogroup" aria-label="Estado" className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
          {statuses.map((status) => {
            const current = status._id === task.statusId;
            return (
              <button
                key={status._id}
                type="button"
                role="radio"
                aria-checked={current}
                aria-busy={pendingMove?.status._id === status._id || undefined}
                onClick={() => !current && requestMove(task, status._id)}
                className={cn(
                  "flex min-h-13 items-center justify-center gap-1.5 rounded-md border-[1.5px] px-3 py-2 text-center font-display text-lg leading-tight font-semibold tracking-[0.02em] uppercase transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed",
                  current
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_2px_8px_-2px_rgb(13_64_155/0.55)]"
                    : "border-rule bg-card text-foreground hover:border-primary hover:bg-accent disabled:hover:border-rule disabled:hover:bg-card",
                  pendingMove?.status._id === status._id && "border-dashed border-primary bg-accent",
                )}
              >
                {current && <CheckIcon className="size-5 shrink-0" strokeWidth={3} />}
                {status.name}
                {status.notifiesCustomer && (
                  <MessageSquareTextIcon
                    aria-label="Avisa al cliente"
                    className="size-4 shrink-0 opacity-70"
                  />
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-[minmax(0,1fr)] border-t border-border sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:border-r sm:px-5">
          <Label htmlFor="task-assignee">Asignada a</Label>
          <Select
            items={assigneeItems}
            value={task.assignee?._id ?? UNASSIGNED}
            disabled={readOnly}
            onValueChange={(value) =>
              void safe(() =>
                assign({
                  taskId: task._id,
                  assigneeId: value === UNASSIGNED ? null : (value as Id<"users">),
                }),
              )
            }
          >
            <SelectTrigger id="task-assignee" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assigneeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {task.assignee && !task.assignee.isActive && (
            <p className="text-[0.875rem] text-muted-foreground">Asignado a usuario inactivo</p>
          )}
        </div>
        <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:px-5">
          <Label htmlFor="task-priority">Prioridad</Label>
          <Select
            items={PRIORITY_ITEMS}
            value={task.priority}
            disabled={readOnly}
            onValueChange={(value) =>
              void safe(() => update({ taskId: task._id, priority: value as Priority }))
            }
          >
            <SelectTrigger
              id="task-priority"
              className={cn("w-full", task.priority === "urgente" && "border-alert-text font-semibold text-alert-text")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:col-span-2 sm:px-5">
          <Label htmlFor="task-deadline-date" className={cn(task.isOverdue && "text-alert-text")}>
            Fecha límite{task.isOverdue && " · vencida"}
          </Label>
          {readOnly ? (
            <span className="pass-figure text-xl font-semibold">
              {task.deadlineAt !== undefined
                ? formatDeadline(task.deadlineAt, task.deadlineHasTime, timezone)
                : "—"}
            </span>
          ) : (
            <DeadlineInputs
              idPrefix="task-deadline"
              value={deadline}
              onChange={(value) => void safe(() => update({ taskId: task._id, deadline: value }))}
            />
          )}
        </div>
        <CustomerBlock
          // Keyed on the values so edits by other users show up live.
          key={`${task.customerName ?? ""}|${task.customerPhone ?? ""}`}
          task={task}
          readOnly={readOnly}
          onSave={(customer) => update({ taskId: task._id, ...customer })}
        />
        {eta && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-3.5 sm:col-span-2 sm:px-5">
            <TruckIcon className="size-5 shrink-0 text-muted-foreground" />
            <span className="pass-label">Llegada:</span>
            <span className="pass-figure text-xl leading-none font-semibold">
              {arrivalLabel(eta, timezone, now)}
            </span>
          </p>
        )}
      </div>
      {noticeDialog}
      <div className="flex flex-col gap-2 px-4 py-4 sm:px-5">
        <Label htmlFor="task-description">Descripción</Label>
        <Textarea
          key={task.description ?? ""}
          id="task-description"
          defaultValue={task.description}
          rows={4}
          disabled={readOnly}
          placeholder="Añade detalles: dirección, contacto, material…"
          onBlur={(event) => {
            const description = event.target.value;
            if (description.trim() !== (task.description ?? "")) {
              void safe(() => update({ taskId: task._id, description }));
            }
          }}
        />
      </div>
    </>
  );
}

/** The task's customer: who the delivery is for and the phone that gets the SMS. */
function CustomerBlock({
  task,
  readOnly,
  onSave,
}: {
  task: TaskData["task"];
  readOnly: boolean;
  onSave: (customer: { customerName?: string; customerPhone?: string }) => Promise<unknown>;
}) {
  const [phoneProblem, setPhoneProblem] = useState<string | null>(null);
  const summary = [task.customerName, task.customerPhone].filter(Boolean).join(" · ");
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-2 border-b border-border px-4 py-4 sm:col-span-2 sm:px-5"
      disabled={readOnly}
    >
      <legend className="float-left mb-2 w-full text-[0.9375rem] font-semibold">Cliente</legend>
      {readOnly ? (
        <span className="text-[1.0625rem]">{summary || "—"}</span>
      ) : (
        <div className="grid w-full gap-2 sm:grid-cols-2">
          <Input
            aria-label="Nombre del cliente"
            placeholder="Nombre del cliente"
            maxLength={80}
            defaultValue={task.customerName}
            onBlur={(event) => {
              const customerName = event.target.value;
              if (customerName.trim() !== (task.customerName ?? "")) void safe(() => onSave({ customerName }));
            }}
          />
          <Input
            aria-label="Teléfono del cliente"
            type="tel"
            inputMode="tel"
            placeholder="+34600111222"
            defaultValue={task.customerPhone}
            aria-invalid={Boolean(phoneProblem)}
            onBlur={(event) => {
              const customerPhone = event.target.value;
              const problem = phoneError(customerPhone);
              setPhoneProblem(problem);
              if (!problem && customerPhone.replace(/[\s\-().]/g, "") !== (task.customerPhone ?? "")) {
                void safe(() => onSave({ customerPhone }));
              }
            }}
          />
        </div>
      )}
      {phoneProblem && (
        <p role="alert" className="text-[0.875rem] font-medium text-destructive">
          {phoneProblem}
        </p>
      )}
      {!readOnly && summary && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-muted-foreground">
          <span>{summary}</span>
          {task.customerPhone && (
            <a
              href={`tel:${task.customerPhone}`}
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline"
            >
              <PhoneIcon className="size-4" /> Llamar
            </a>
          )}
        </p>
      )}
    </fieldset>
  );
}

function Comments({
  taskId,
  timezone,
  readOnly,
}: {
  taskId: Id<"tasks">;
  timezone: string;
  readOnly: boolean;
}) {
  const comments = useQuery(api.comments.list, { taskId });
  const add = useMutation(api.comments.add);
  const edit = useMutation(api.comments.edit);
  const remove = useMutation(api.comments.remove);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<Id<"comments"> | null>(null);

  return (
    <section className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
      <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 font-display text-xl leading-none font-bold tracking-[0.03em] uppercase sm:px-5">
        Comentarios
        {!!comments?.length && (
          <span className="pass-figure inline-flex h-7 min-w-7 items-center justify-center rounded-sm bg-panel px-1.5 text-lg">
            {comments.length}
          </span>
        )}
      </h3>
      {comments?.length === 0 && (
        <p className="px-4 pt-4 text-[0.9375rem] text-muted-foreground sm:px-5">Todavía no hay comentarios.</p>
      )}
      <ul className="flex flex-col divide-y divide-border">
        {comments?.map((comment) => (
          <li key={comment._id} className="px-4 py-3.5 sm:px-5">
            <div className="mb-1.5 flex items-center gap-2 text-[0.875rem] text-muted-foreground">
              <span className="text-base font-semibold text-foreground">{comment.authorName}</span>
              <span>{formatWhen(comment._creationTime, timezone)}</span>
              {comment.editedAt && <span>(editado)</span>}
              <span className="ml-auto flex gap-1">
                {comment.canEdit && !readOnly && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar comentario"
                    onClick={() => setEditing(comment._id)}
                  >
                    <PencilIcon />
                  </Button>
                )}
                {comment.canDelete && !readOnly && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar comentario"
                    onClick={() => void safe(() => remove({ commentId: comment._id }))}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </span>
            </div>
            {editing === comment._id ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const value = String(new FormData(event.currentTarget).get("body"));
                  await safe(() => edit({ commentId: comment._id, body: value }));
                  setEditing(null);
                }}
              >
                <Textarea name="body" defaultValue={comment.body} rows={2} autoFocus />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Guardar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <p className="max-w-[65ch] text-base whitespace-pre-wrap">{comment.body}</p>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form
          className="flex flex-col gap-2 border-t border-border bg-muted/60 px-4 py-4 sm:px-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!body.trim()) return;
            await safe(async () => {
              await add({ taskId, body });
              setBody("");
            });
          }}
        >
          <Textarea
            aria-label="Nuevo comentario"
            placeholder="Escribe un comentario…"
            value={body}
            maxLength={5000}
            rows={2}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button type="submit" className="self-end" disabled={!body.trim()}>
            Comentar
          </Button>
        </form>
      )}
    </section>
  );
}

function ActivityLog({ taskId, timezone }: { taskId: Id<"tasks">; timezone: string }) {
  const activity = useQuery(api.tasks.activity, { taskId });
  return (
    <section className="rounded-lg bg-card px-4 py-4 ring-1 ring-foreground/10 sm:px-5">
      <h3 className="mb-3 font-display text-xl leading-none font-bold tracking-[0.03em] uppercase">
        Actividad
      </h3>
      <ol className="flex flex-col gap-3 border-l-2 border-rule pl-4">
        {activity?.map((entry) => (
          <li key={entry._id} className="relative text-[0.9375rem]">
            <span aria-hidden className="absolute top-2 -left-[1.3rem] size-2 rounded-full bg-rule ring-2 ring-card" />
            <span className="font-semibold">{entry.actorName}</span> {describeActivity(entry, timezone)}
            <span className="pass-figure block text-base text-muted-foreground">
              {formatWhen(entry._creationTime, timezone)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DeleteTask({
  taskId,
  title,
  onDeleted,
}: {
  taskId: Id<"tasks">;
  title: string;
  onDeleted: () => void;
}) {
  const remove = useMutation(api.tasks.remove);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" className="self-start" onClick={() => setOpen(true)}>
        <Trash2Icon /> Eliminar tarea
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán también sus comentarios y su historial. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  // Close the detail first so its queries stop before the task disappears.
                  onDeleted();
                  await remove({ taskId });
                  toast.success("Tarea eliminada");
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
