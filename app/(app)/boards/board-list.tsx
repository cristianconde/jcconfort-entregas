"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangleIcon, ArchiveIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/components/current-user";
import { FormError, FormField } from "@/components/form-field";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

export function BoardList() {
  const me = useCurrentUser();
  const now = useNow();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const boards = useQuery(api.boards.listMine, { now, includeArchived: showArchived });
  const isAdmin = me.role === "admin";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title mr-auto">Tableros</h1>
        {isAdmin && (
          <>
            <div className="flex items-center gap-2.5">
              <Switch id="archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="archived" className="font-sans text-[0.9375rem] font-medium tracking-normal text-foreground normal-case">
                Mostrar archivados
              </Label>
            </div>
            <Button onClick={() => setCreating(true)}>
              <PlusIcon /> Nuevo tablero
            </Button>
          </>
        )}
      </div>

      {boards === undefined ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 bg-card" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-rule bg-card/60 px-6 py-12 text-center text-[1.0625rem] text-muted-foreground">
          {isAdmin
            ? "Todavía no hay tableros. Crea el primero para empezar a organizar las tareas."
            : "Todavía no perteneces a ningún tablero. Pide a un administrador que te añada."}
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <li key={board._id}>
              <Link
                href={`/boards/${board._id}`}
                className="group flex h-full flex-col overflow-hidden rounded-lg bg-card shadow-[0_1px_2px_rgb(14_21_34/0.06),0_6px_18px_-10px_rgb(14_21_34/0.25)] ring-1 ring-foreground/10 transition-[box-shadow,transform] duration-150 outline-none [--notch:var(--background)] hover:-translate-y-px hover:shadow-[0_2px_4px_rgb(14_21_34/0.08),0_14px_28px_-12px_rgb(14_21_34/0.35)] focus-visible:ring-3 focus-visible:ring-primary/60"
              >
                <div className="flex flex-1 items-start gap-3 px-4 pt-4 pb-4 sm:px-5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <h2 className="flex items-center gap-2 font-display text-2xl leading-tight font-bold tracking-[0.02em] uppercase">
                      {board.isArchived && (
                        <ArchiveIcon aria-label="Archivado" className="size-5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 break-words">{board.name}</span>
                    </h2>
                    {board.description && (
                      <p className="line-clamp-2 text-[0.9375rem] text-muted-foreground">{board.description}</p>
                    )}
                  </div>
                  <ChevronRightIcon className="mt-1 size-6 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <div className="pass-tear" aria-hidden />
                <dl className="grid grid-cols-2">
                  <div className="flex flex-col gap-1 px-4 pt-3 pb-3.5 sm:px-5">
                    <dt className="pass-label">Abiertas</dt>
                    <dd className="pass-figure text-[2rem] leading-none font-bold">{board.openCount}</dd>
                  </div>
                  <div
                    className={cn(
                      "flex flex-col gap-1 border-l border-border px-4 pt-3 pb-3.5 sm:px-5",
                      board.overdueCount > 0 && "border-alert bg-alert text-alert-foreground",
                    )}
                  >
                    <dt
                      className={cn(
                        "pass-label flex items-center gap-1",
                        board.overdueCount > 0 && "text-alert-foreground",
                      )}
                    >
                      {board.overdueCount > 0 && <AlertTriangleIcon className="size-3.5" strokeWidth={2.5} />}
                      Vencidas
                    </dt>
                    <dd
                      className={cn(
                        "pass-figure text-[2rem] leading-none font-bold",
                        board.overdueCount === 0 && "text-muted-foreground",
                      )}
                    >
                      {board.overdueCount}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && <CreateBoardDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateBoardDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useMutation(api.boards.create);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const boardId = await create({
        name: String(form.get("name")),
        description: String(form.get("description") ?? ""),
      });
      router.push(`/boards/${boardId}/settings`);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo tablero</DialogTitle>
          <DialogDescription>
            Después podrás añadir miembros y ajustar los estados.
          </DialogDescription>
        </DialogHeader>
        <form id="board-form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField id="name" label="Nombre">
            <Input id="name" name="name" required maxLength={80} placeholder="Entregas Madrid" />
          </FormField>
          <FormField id="description" label="Descripción (opcional)">
            <Textarea id="description" name="description" maxLength={2000} />
          </FormField>
          <FormError message={error} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="board-form" disabled={pending}>
            {pending ? "Creando…" : "Crear tablero"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
