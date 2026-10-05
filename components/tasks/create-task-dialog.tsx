"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormError, FormField } from "@/components/form-field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DeadlineInput } from "@/convex/lib/deadline";
import { phoneError } from "@/convex/lib/validation";
import { errorMessage } from "@/lib/errors";
import { PRIORITY_ITEMS, type Priority } from "@/lib/labels";
import { DeadlineInputs } from "./deadline-inputs";

const UNASSIGNED = "__none__";

export function CreateTaskDialog({
  boardId,
  statuses,
  defaultStatusId,
  onClose,
}: {
  boardId: Id<"boards">;
  statuses: { _id: Id<"boardStatuses">; name: string }[];
  defaultStatusId?: Id<"boardStatuses">;
  onClose: () => void;
}) {
  const create = useMutation(api.tasks.create);
  const members = useQuery(api.boards.assignableMembers, { boardId }) ?? [];
  const [statusId, setStatusId] = useState(defaultStatusId ?? statuses[0]?._id);
  const [assignee, setAssignee] = useState<string>(UNASSIGNED);
  const [priority, setPriority] = useState<Priority>("media");
  const [deadline, setDeadline] = useState<DeadlineInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneProblem, setPhoneProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const statusItems = statuses.map((s) => ({ value: s._id, label: s.name }));
  const assigneeItems = [
    { value: UNASSIGNED, label: "Sin asignar" },
    ...members.map((m) => ({ value: m._id, label: m.name })),
  ];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customerPhone = String(form.get("customerPhone") ?? "");
    const problem = phoneError(customerPhone);
    setPhoneProblem(problem);
    if (problem) return;
    setPending(true);
    setError(null);
    try {
      await create({
        boardId,
        title: String(form.get("title")),
        description: String(form.get("description") ?? ""),
        statusId,
        priority,
        assigneeId: assignee === UNASSIGNED ? undefined : (assignee as Id<"users">),
        deadline: deadline ?? undefined,
        customerName: String(form.get("customerName") ?? ""),
        customerPhone,
      });
      toast.success("Tarea creada");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
        </DialogHeader>
        <form id="task-form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField id="title" label="Título">
            <Input id="title" name="title" required maxLength={200} autoFocus />
          </FormField>
          <FormField id="description" label="Descripción (opcional)">
            <Textarea id="description" name="description" rows={3} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="status" label="Estado">
              <Select
                items={statusItems}
                value={statusId}
                onValueChange={(v) => setStatusId(v as Id<"boardStatuses">)}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField id="priority" label="Prioridad">
              <Select
                items={PRIORITY_ITEMS}
                value={priority}
                onValueChange={(v) => setPriority(v as Priority)}
              >
                <SelectTrigger id="priority" className="w-full">
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
            </FormField>
          </div>
          <FormField id="assignee" label="Asignar a">
            <Select
              items={assigneeItems}
              value={assignee}
              onValueChange={(v) => setAssignee(String(v))}
            >
              <SelectTrigger id="assignee" className="w-full">
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
          </FormField>
          <FormField id="deadline-date" label="Fecha límite (opcional)">
            <DeadlineInputs idPrefix="deadline" value={deadline} onChange={setDeadline} />
          </FormField>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-[0.9375rem] font-semibold">Cliente (opcional)</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                name="customerName"
                aria-label="Nombre del cliente"
                placeholder="Nombre del cliente"
                maxLength={80}
              />
              <Input
                name="customerPhone"
                type="tel"
                inputMode="tel"
                aria-label="Teléfono del cliente"
                placeholder="+34600111222"
                aria-invalid={Boolean(phoneProblem)}
                onBlur={(event) => setPhoneProblem(phoneError(event.target.value))}
              />
            </div>
            {phoneProblem ? (
              <p role="alert" className="text-[0.875rem] font-medium text-destructive">
                {phoneProblem}
              </p>
            ) : (
              <p className="text-[0.875rem] text-muted-foreground">
                El teléfono, en formato internacional, se usa para avisarle por SMS de la entrega.
              </p>
            )}
          </fieldset>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="task-form" disabled={pending}>
            {pending ? "Creando…" : "Crear tarea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
