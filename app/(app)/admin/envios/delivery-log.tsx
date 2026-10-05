"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { RotateCwIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { useTimezone } from "@/lib/use-app-settings";

type Row = FunctionReturnType<typeof api.notifications.deliveries.log>[number];

const STATES: Record<Row["state"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendiente", variant: "outline" },
  sent: { label: "Enviada", variant: "secondary" },
  delivered: { label: "Entregada", variant: "default" },
  failed: { label: "Fallida", variant: "destructive" },
  dismissed: { label: "Descartada", variant: "outline" },
};

/** Admin log of SMS to customers (plus historical sends to team members). */
export function DeliveryLog() {
  const rows = useQuery(api.notifications.deliveries.log, {});
  const retry = useMutation(api.notifications.deliveries.retry);
  const timezone = useTimezone();
  const format = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  });

  async function onRetry(row: Row) {
    try {
      await retry({ deliveryId: row._id });
      toast.success(`Reenviando a ${row.recipientName}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">Envíos de SMS</h1>
        <p className="text-sm text-muted-foreground">
          Los últimos 100 SMS enviados a clientes. Se actualiza solo cuando el proveedor confirma la
          entrega. «Reintentar» envía el mismo mensaje al teléfono actual del cliente en la tarea.
        </p>
      </div>
      {rows === undefined ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-rule bg-card/60 px-6 py-12 text-center text-[1.0625rem] text-muted-foreground">
          Todavía no se ha enviado ningún SMS.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Tarea</TableHead>
                <TableHead>Mensaje</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._id}>
                  <TableCell className="align-top whitespace-nowrap text-muted-foreground">
                    {format.format(row._creationTime)}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="font-medium">{row.recipientName}</div>
                    {row.recipient === "user" && (
                      <div className="text-xs text-muted-foreground">Equipo (envío antiguo)</div>
                    )}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap">{row.phone ?? "—"}</TableCell>
                  <TableCell className="max-w-48 align-top whitespace-normal">
                    {row.taskId ? (
                      <Link
                        href={`/tasks/${row.taskId}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {row.taskTitle}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Tarea eliminada</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md min-w-64 align-top">
                    <p className="text-sm whitespace-normal">{row.message}</p>
                    {(row.channel !== "sms" || row.attempts > 1) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[
                          row.channel !== "sms" && row.channelLabel,
                          row.attempts > 1 && `${row.attempts} intentos`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={STATES[row.state].variant}>{STATES[row.state].label}</Badge>
                  </TableCell>
                  <TableCell className="max-w-56 align-top text-sm whitespace-normal text-destructive">
                    {row.error}
                  </TableCell>
                  <TableCell className="align-top">
                    {row.state === "failed" && row.channel === "sms" && row.recipient === "customer" && (
                      <Button size="sm" variant="outline" onClick={() => void onRetry(row)}>
                        <RotateCwIcon /> Reintentar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
