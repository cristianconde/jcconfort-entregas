"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  BellIcon,
  BellRingIcon,
  CheckCircle2Icon,
  CircleIcon,
  MessageSquareTextIcon,
  PlusIcon,
  Trash2Icon,
  UserMinusIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/components/current-user";
import { FormError, FormField } from "@/components/form-field";
import { NoAccess } from "@/components/no-access";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_CUSTOMER_TEMPLATE, TEMPLATE_PLACEHOLDERS } from "@/convex/lib/customerMessage";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type BoardData = FunctionReturnType<typeof api.boards.get>;
type Status = BoardData["statuses"][number];
type StatusRule = FunctionReturnType<typeof api.boards.getStatusRules>[number];

/** Runs a mutation and reports failures as a toast. */
function useSafe() {
  return async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) toast.success(success);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  };
}

export function BoardSettings({ boardId }: { boardId: Id<"boards"> }) {
  const me = useCurrentUser();
  const data = useQuery(api.boards.get, me.role === "admin" ? { boardId } : "skip");

  if (me.role !== "admin") {
    return <NoAccess message="Solo los administradores pueden configurar tableros" />;
  }
  if (data === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Volver al tablero"
          nativeButton={false}
          render={<Link href={`/boards/${boardId}`} />}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="page-title">Ajustes de «{data.board.name}»</h1>
      </div>
      <DetailsCard data={data} />
      <MembersCard data={data} />
      <StatusesCard data={data} />
    </div>
  );
}

function DetailsCard({ data }: { data: BoardData }) {
  const { board } = data;
  const update = useMutation(api.boards.update);
  const setArchived = useMutation(api.boards.setArchived);
  const safe = useSafe();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await update({
        boardId: board._id,
        name: String(form.get("name")),
        description: String(form.get("description") ?? ""),
      });
      toast.success("Tablero actualizado");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Detalles {board.isArchived && <Badge variant="secondary">Archivado</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField id="name" label="Nombre">
            <Input id="name" name="name" required maxLength={80} defaultValue={board.name} />
          </FormField>
          <FormField id="description" label="Descripción">
            <Textarea
              id="description"
              name="description"
              maxLength={2000}
              defaultValue={board.description}
            />
          </FormField>
          <FormError message={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Guardar</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void safe(
                  () => setArchived({ boardId: board._id, isArchived: !board.isArchived }),
                  board.isArchived ? "Tablero restaurado" : "Tablero archivado",
                )
              }
            >
              {board.isArchived ? "Restaurar tablero" : "Archivar tablero"}
            </Button>
          </div>
          {board.isArchived && (
            <p className="text-sm text-muted-foreground">
              Un tablero archivado es de solo lectura y no aparece en la lista por defecto.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function MembersCard({ data }: { data: BoardData }) {
  const boardId = data.board._id;
  const allUsers = useQuery(api.users.list, {});
  const addMember = useMutation(api.boards.addMember);
  const removeMember = useMutation(api.boards.removeMember);
  const safe = useSafe();
  const [selected, setSelected] = useState<Id<"users"> | null>(null);

  const memberIds = new Set(data.members.map((m) => m._id));
  const candidates = (allUsers ?? []).filter((u) => u.isActive && !memberIds.has(u._id));
  const candidateItems = candidates.map((u) => ({ value: u._id, label: `${u.name} (${u.email})` }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Miembros</CardTitle>
        <CardDescription>
          Solo los miembros ven el tablero y pueden recibir tareas. Al quitar a alguien, sus tareas
          abiertas quedan sin asignar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Select
            items={candidateItems}
            value={selected}
            onValueChange={(value) => setSelected(value as Id<"users"> | null)}
          >
            <SelectTrigger className="min-w-64 flex-1" aria-label="Usuario a añadir">
              <SelectValue placeholder="Elige un usuario para añadir" />
            </SelectTrigger>
            <SelectContent>
              {candidateItems.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">No hay más usuarios activos.</p>
              )}
              {candidateItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!selected}
            onClick={async () => {
              if (!selected) return;
              if (await safe(() => addMember({ boardId, userId: selected }), "Miembro añadido")) {
                setSelected(null);
              }
            }}
          >
            <PlusIcon /> Añadir
          </Button>
        </div>
        <ul className="divide-y overflow-hidden rounded-md border border-border">
          {data.members.map((member) => (
            <li key={member._id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}{" "}
                  {!member.isActive && <Badge variant="secondary">Inactivo</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar a ${member.name}`}
                onClick={() =>
                  void safe(
                    () => removeMember({ boardId, userId: member._id }),
                    `${member.name} ya no es miembro`,
                  )
                }
              >
                <UserMinusIcon />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StatusesCard({ data }: { data: BoardData }) {
  const boardId = data.board._id;
  const { statuses } = data;
  const addStatus = useMutation(api.boards.addStatus);
  const renameStatus = useMutation(api.boards.renameStatus);
  const reorder = useMutation(api.boards.reorderStatuses);
  const setDone = useMutation(api.boards.setDoneStatus);
  const safe = useSafe();
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState<Status | null>(null);
  const [editingRule, setEditingRule] = useState<Status | null>(null);
  const rules = useQuery(api.boards.getStatusRules, { boardId });
  const ruleByStatus = new Map((rules ?? []).map((rule) => [rule.statusId, rule]));

  function move(index: number, delta: -1 | 1) {
    const ids = statuses.map((s) => s._id);
    const [item] = ids.splice(index, 1);
    ids.splice(index + delta, 0, item!);
    void safe(() => reorder({ boardId, orderedIds: ids }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estados</CardTitle>
        <CardDescription>
          Son las columnas del tablero. El estado marcado como «hecho» indica que la tarea está
          terminada: no cuenta como abierta ni vencida. Con la campana eliges a quién avisar cuando
          una tarea llega a un estado, y si al llegar se avisa al cliente por SMS.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol className="divide-y overflow-hidden rounded-md border border-border">
          {statuses.map((status, index) => (
            <li key={status._id} className="flex items-center gap-2 px-3 py-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={status.isDone ? "Estado «hecho»" : `Marcar «${status.name}» como hecho`}
                aria-pressed={status.isDone}
                onClick={() =>
                  !status.isDone &&
                  void safe(() => setDone({ statusId: status._id }), `«${status.name}» es ahora el estado hecho`)
                }
              >
                {status.isDone ? <CheckCircle2Icon className="text-primary" /> : <CircleIcon />}
              </Button>
              <Input
                aria-label="Nombre del estado"
                defaultValue={status.name}
                maxLength={40}
                className="h-8 flex-1"
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== status.name) {
                    void safe(() => renameStatus({ statusId: status._id, name }), "Estado renombrado");
                  }
                }}
              />
              <RuleButton status={status} rule={ruleByStatus.get(status._id)} onClick={() => setEditingRule(status)} />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Subir"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Bajar"
                disabled={index === statuses.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Eliminar «${status.name}»`}
                onClick={() => setRemoving(status)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ol>
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await safe(() => addStatus({ boardId, name: newName }), "Estado añadido")) {
              setNewName("");
            }
          }}
        >
          <Input
            aria-label="Nuevo estado"
            placeholder="Nuevo estado, p. ej. En revisión"
            value={newName}
            maxLength={40}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button type="submit" disabled={!newName.trim()}>
            <PlusIcon /> Añadir
          </Button>
        </form>
      </CardContent>
      {editingRule && (
        <RuleDialog
          status={editingRule}
          rule={ruleByStatus.get(editingRule._id)}
          onClose={() => setEditingRule(null)}
        />
      )}
      {removing && (
        <RemoveStatusDialog
          status={removing}
          others={statuses.filter((s) => s._id !== removing._id)}
          onClose={() => setRemoving(null)}
        />
      )}
    </Card>
  );
}

function RemoveStatusDialog({
  status,
  others,
  onClose,
}: {
  status: Status;
  others: Status[];
  onClose: () => void;
}) {
  const removeStatus = useMutation(api.boards.removeStatus);
  const items = others.map((s) => ({ value: s._id, label: s.name }));
  const [target, setTarget] = useState<Id<"boardStatuses"> | null>(others[0]?._id ?? null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await removeStatus({ statusId: status._id, moveTasksTo: target ?? undefined });
      toast.success(`Estado «${status.name}» eliminado`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar «{status.name}»</DialogTitle>
          <DialogDescription>
            Si hay tareas en este estado, se moverán al estado que elijas.
          </DialogDescription>
        </DialogHeader>
        <FormField id="target" label="Mover sus tareas a">
          <Select
            items={items}
            value={target}
            onValueChange={(value) => setTarget(value as Id<"boardStatuses">)}
          >
            <SelectTrigger id="target" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormError message={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void confirm()}>
            Eliminar estado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleButton({
  status,
  rule,
  onClick,
}: {
  status: Status;
  rule: StatusRule | undefined;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={
        rule
          ? `Aviso al llegar a «${status.name}» (activo${rule.notifyCustomer ? ", avisa al cliente" : ""})`
          : `Avisar al llegar a «${status.name}»`
      }
      className={cn("relative", rule?.notifyCustomer && "w-auto gap-1 px-2.5")}
      onClick={onClick}
    >
      {rule ? <BellRingIcon className="text-primary" /> : <BellIcon />}
      {rule && (
        <span className="absolute top-0.5 left-7 size-1.5 rounded-full bg-primary" aria-hidden />
      )}
      {rule?.notifyCustomer && (
        <span
          title="Avisa al cliente"
          className="inline-flex h-6 items-center gap-1 rounded-sm bg-primary px-1.5 font-label text-[0.75rem] font-semibold tracking-[0.06em] text-primary-foreground uppercase"
        >
          <MessageSquareTextIcon className="size-3.5" /> Cliente
        </span>
      )}
    </Button>
  );
}

/** Stage notification rule for one status: who hears about tasks reaching it. */
function RuleDialog({
  status,
  rule,
  onClose,
}: {
  status: Status;
  rule: StatusRule | undefined;
  onClose: () => void;
}) {
  const users = useQuery(api.users.list, {});
  const setRule = useMutation(api.boards.setStatusRule);
  const clearRule = useMutation(api.boards.clearStatusRule);
  const [notifyAssignee, setNotifyAssignee] = useState(rule?.notifyAssignee ?? false);
  const [notifyCreator, setNotifyCreator] = useState(rule?.notifyCreator ?? false);
  const [userIds, setUserIds] = useState<Id<"users">[]>(rule?.userIds ?? []);
  const [notifyCustomer, setNotifyCustomer] = useState(rule?.notifyCustomer ?? false);
  const [template, setTemplate] = useState(rule?.customerTemplate ?? DEFAULT_CUSTOMER_TEMPLATE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Inactive users can't be chosen, but keep showing any already in the rule.
  const choices = (users ?? []).filter((u) => u.isActive || userIds.includes(u._id));

  function toggleUser(userId: Id<"users">, checked: boolean) {
    setUserIds((ids) => (checked ? [...ids, userId] : ids.filter((id) => id !== userId)));
  }

  async function run(fn: () => Promise<unknown>, success: string) {
    setPending(true);
    setError(null);
    try {
      await fn();
      toast.success(success);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Avisar al llegar a «{status.name}»</DialogTitle>
          <DialogDescription>
            Cuando una tarea entre en este estado, avisaremos a estas personas dentro de la
            aplicación. Quien mueve la tarea nunca recibe aviso de su propio cambio.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={notifyAssignee} onCheckedChange={setNotifyAssignee} />
            Persona asignada
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={notifyCreator} onCheckedChange={setNotifyCreator} />
            Creador de la tarea
          </Label>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Y además a estos usuarios</p>
            {users === undefined ? (
              <Skeleton className="h-24" />
            ) : (
              <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                {choices.map((user) => (
                  <li key={user._id}>
                    <Label className="flex items-center gap-2 px-3 py-2 font-normal">
                      <Checkbox
                        checked={userIds.includes(user._id)}
                        onCheckedChange={(checked) => toggleUser(user._id, checked)}
                      />
                      <span className="min-w-0 flex-1 truncate">{user.name}</span>
                      {!user.isActive && <Badge variant="secondary">Inactivo</Badge>}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <label htmlFor="rule-customer" className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
              <span className="flex flex-col gap-1">
                <span className="text-base font-semibold">Avisar al cliente</span>
                <span className="text-[0.875rem] text-muted-foreground">
                  Al mover una tarea a este estado se pide confirmación y se puede enviar un SMS al
                  cliente de la tarea.
                </span>
              </span>
              <Switch id="rule-customer" checked={notifyCustomer} onCheckedChange={setNotifyCustomer} />
            </label>
            {notifyCustomer && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="rule-template">Mensaje para el cliente</Label>
                <Textarea
                  id="rule-template"
                  rows={4}
                  maxLength={400}
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                />
                <ul className="flex flex-col gap-0.5 text-[0.875rem] text-muted-foreground">
                  {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                    <li key={placeholder.name}>
                      <code className="font-semibold text-foreground">{placeholder.name}</code>{" "}
                      {placeholder.description}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="link"
                  className="h-11 self-start px-0"
                  disabled={template === DEFAULT_CUSTOMER_TEMPLATE}
                  onClick={() => setTemplate(DEFAULT_CUSTOMER_TEMPLATE)}
                >
                  Restaurar texto por defecto
                </Button>
              </div>
            )}
          </div>
        </div>
        <FormError message={error} />
        <DialogFooter>
          {rule && (
            <Button
              variant="ghost"
              className="sm:mr-auto"
              disabled={pending}
              onClick={() =>
                void run(() => clearRule({ statusId: status._id }), "Aviso eliminado")
              }
            >
              Quitar regla
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              void run(
                () =>
                  setRule({
                    statusId: status._id,
                    notifyAssignee,
                    notifyCreator,
                    userIds,
                    notifyCustomer,
                    customerTemplate: notifyCustomer ? template : undefined,
                  }),
                "Aviso guardado",
              )
            }
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
