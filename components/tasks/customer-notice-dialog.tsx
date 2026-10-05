"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_CUSTOMER_TEMPLATE,
  etaError,
  gsmLength,
  localDate,
  renderCustomerMessage,
  SMS_MAX_SEPTETS,
  toGsm7,
  type Eta,
} from "@/convex/lib/customerMessage";
import { phoneError } from "@/convex/lib/validation";
import { errorMessage } from "@/lib/errors";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

type CustomerNotice = NonNullable<FunctionArgs<typeof api.tasks.move>["customerNotice"]>;

export type NoticeTask = {
  _id: Id<"tasks">;
  statusId: Id<"boardStatuses">;
  title: string;
  customerName?: string;
  customerPhone?: string;
};

export type NoticeStatus = {
  _id: Id<"boardStatuses">;
  name: string;
  notifiesCustomer: boolean;
  customerTemplate?: string;
};

type PendingMove = { task: NoticeTask; status: NoticeStatus; order?: number };

function useMoveTask() {
  return useMutation(api.tasks.move).withOptimisticUpdate((store, { taskId, statusId, order }) => {
    for (const { args, value } of store.getAllQueries(api.tasks.listForBoard)) {
      if (!value) continue;
      store.setQuery(
        api.tasks.listForBoard,
        args,
        value.map((task) =>
          task._id === taskId ? { ...task, statusId, order: order ?? task.order } : task,
        ),
      );
    }
  });
}

/**
 * Moving a task, for both entry points (Kanban drag-and-drop and the estado
 * buttons). A move into a status marked "Avisar al cliente" first opens the
 * "Aviso al cliente" confirmation and is only applied (optimistically) once
 * confirmed; cancelling changes nothing. Render `dialog` somewhere.
 */
export function useMoveWithNotice(statuses: NoticeStatus[], smsAvailable: boolean) {
  const move = useMoveTask();
  const [pending, setPending] = useState<PendingMove | null>(null);

  function requestMove(task: NoticeTask, statusId: Id<"boardStatuses">, order?: number) {
    const status = statuses.find((s) => s._id === statusId);
    if (status?.notifiesCustomer && task.statusId !== statusId) {
      setPending({ task, status, order });
      return;
    }
    move({ taskId: task._id, statusId, order }).catch((error) => toast.error(errorMessage(error)));
  }

  const dialog = pending && (
    <CustomerNoticeDialog
      task={pending.task}
      status={pending.status}
      smsAvailable={smsAvailable}
      onCancel={() => setPending(null)}
      onConfirm={async (customerNotice) => {
        await move({
          taskId: pending.task._id,
          statusId: pending.status._id,
          order: pending.order,
          customerNotice,
        });
        setPending(null);
        toast.success(
          customerNotice.send && smsAvailable ? "Tarea movida y cliente avisado" : "Tarea movida",
        );
      }}
    />
  );

  return { requestMove, dialog, pending };
}

type Day = "today" | "tomorrow" | "date";

/** The confirmation shown before a task enters a status marked "Avisar al cliente". */
export function CustomerNoticeDialog({
  task,
  status,
  smsAvailable,
  onConfirm,
  onCancel,
}: {
  task: NoticeTask;
  status: NoticeStatus;
  smsAvailable: boolean;
  onConfirm: (notice: CustomerNotice) => Promise<void>;
  onCancel: () => void;
}) {
  const now = useNow();
  const settings = useQuery(api.settings.get, {});
  const timezone = settings?.timezone ?? "Europe/Madrid";

  const [send, setSend] = useState(smsAvailable && Boolean(task.customerPhone));
  const [phone, setPhone] = useState(task.customerPhone ?? "");
  const [day, setDay] = useState<Day>("today");
  const [otherDate, setOtherDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // null until the user types in the message: until then it follows the template.
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const today = localDate(now, timezone);
  const date = day === "today" ? today : day === "tomorrow" ? localDate(now, timezone, 1) : otherDate;
  const eta: Eta | undefined = from ? { date, from, to: to || undefined } : undefined;
  const windowError = eta
    ? etaError(eta, timezone, now)
    : to
      ? "Indica la hora «desde» de la llegada"
      : null;

  const preview = renderCustomerMessage({
    template: status.customerTemplate ?? DEFAULT_CUSTOMER_TEMPLATE,
    customerName: task.customerName,
    appName: settings?.appName ?? "",
    eta: windowError ? undefined : eta,
    timezone,
    now,
  });
  const message = edited ?? preview;
  const septets = gsmLength(toGsm7(message.trim()));
  const tooLong = septets > SMS_MAX_SEPTETS;

  const sending = send && smsAvailable;
  const phoneProblem = sending && !phone.trim() ? "Para avisar al cliente hace falta su teléfono" : phoneError(phone);
  const messageProblem = !sending
    ? null
    : tooLong
      ? "El mensaje es demasiado largo (máximo 2 SMS)"
      : message.trim() === ""
        ? "El mensaje no puede estar vacío"
        : null;
  const blocked = Boolean(windowError || phoneProblem || messageProblem) || !settings;

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm({
        send: sending,
        phone,
        eta,
        // Unedited: the server renders the template itself.
        message: sending && edited !== null ? edited : undefined,
      });
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aviso al cliente</DialogTitle>
          <DialogDescription>
            «{task.title}» pasa a <span className="font-semibold text-foreground">{status.name}</span>.
            {task.customerName && <> Cliente: {task.customerName}.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <label
            htmlFor="notice-send"
            className={cn(
              "flex min-h-14 items-center justify-between gap-4 rounded-lg border p-3",
              smsAvailable ? "cursor-pointer" : "bg-muted/60",
            )}
          >
            <span className="flex flex-col gap-1">
              <span className="text-base font-semibold">Avisar al cliente</span>
              <span className="text-[0.875rem] text-muted-foreground">
                {smsAvailable
                  ? "Se le envía un SMS automáticamente al confirmar."
                  : "Los SMS a clientes no están disponibles ahora (desactivados en Ajustes o proveedor sin configurar). Se guardará la llegada estimada, pero no se enviará nada."}
              </span>
            </span>
            <Switch
              id="notice-send"
              checked={sending}
              disabled={!smsAvailable}
              onCheckedChange={setSend}
            />
          </label>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notice-phone">Teléfono del cliente</Label>
            <Input
              id="notice-phone"
              type="tel"
              inputMode="tel"
              placeholder="+34600111222"
              value={phone}
              aria-invalid={Boolean(phoneProblem)}
              aria-describedby="notice-phone-help"
              onChange={(event) => setPhone(event.target.value)}
            />
            <p
              id="notice-phone-help"
              className={cn(
                "text-[0.875rem]",
                phoneProblem ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {phoneProblem ?? "Si lo cambias, se guarda en la tarea."}
            </p>
          </div>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-[0.9375rem] font-semibold">Llegada estimada (opcional)</legend>
            <div role="radiogroup" aria-label="Día de llegada" className="grid grid-cols-3 gap-2">
              {(
                [
                  ["today", "Hoy"],
                  ["tomorrow", "Mañana"],
                  ["date", "Otra fecha"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={day === value}
                  onClick={() => setDay(value)}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-md border-[1.5px] px-2 text-base font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    day === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-rule bg-card text-foreground hover:border-primary hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {day === "date" && (
              <Input
                type="date"
                aria-label="Fecha de llegada"
                min={today}
                value={otherDate}
                onChange={(event) => setOtherDate(event.target.value)}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="notice-from">Desde</Label>
                <Input
                  id="notice-from"
                  type="time"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notice-to">Hasta (opcional)</Label>
                <Input
                  id="notice-to"
                  type="time"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
            </div>
            {windowError && (
              <p role="alert" className="text-[0.875rem] font-medium text-destructive">
                {windowError}
              </p>
            )}
          </fieldset>

          {sending && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="notice-message">Mensaje</Label>
                <span
                  aria-live="polite"
                  aria-label={`${septets} de ${SMS_MAX_SEPTETS} caracteres`}
                  className={cn(
                    "pass-figure text-base",
                    tooLong ? "font-semibold text-destructive" : "text-muted-foreground",
                  )}
                >
                  {septets} / {SMS_MAX_SEPTETS}
                </span>
              </div>
              <Textarea
                id="notice-message"
                rows={4}
                value={message}
                aria-invalid={Boolean(messageProblem)}
                onChange={(event) => setEdited(event.target.value)}
              />
              <p
                className={cn(
                  "text-[0.875rem]",
                  messageProblem ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                {messageProblem ??
                  (edited === null
                    ? "Puedes cambiarlo solo para esta tarea. Se envía sin tildes en á, í, ó, ú."
                    : "Texto cambiado para esta tarea: ya no se actualiza con la llegada.")}
              </p>
              {edited !== null && (
                <Button
                  type="button"
                  variant="link"
                  className="h-11 self-start px-0"
                  onClick={() => setEdited(null)}
                >
                  Volver al texto del estado
                </Button>
              )}
            </div>
          )}
          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button disabled={pending || blocked} onClick={() => void confirm()}>
            {pending ? "Moviendo…" : sending ? "Mover y avisar" : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
