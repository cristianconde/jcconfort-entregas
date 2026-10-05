import { arrivalLabel } from "../convex/lib/customerMessage";
import { formatDeadline } from "../convex/lib/deadline";

export type ActivityEntry = { kind: string; from?: string; to?: string; _creationTime: number };

/** Spanish wording of a task activity entry, to follow the actor's name. */
export function describeActivity(entry: ActivityEntry, timezone: string): string {
  const deadline = (value?: string) => {
    if (!value) return "";
    const [at, withTime] = value.split("|");
    return formatDeadline(Number(at), withTime === "1", timezone);
  };
  switch (entry.kind) {
    case "created":
      return "creó la tarea";
    case "title":
      return `cambió el título de «${entry.from}» a «${entry.to}»`;
    case "description":
      return "editó la descripción";
    case "status":
      return `cambió el estado de ${entry.from ?? "—"} a ${entry.to}`;
    case "assignee":
      if (entry.to && entry.from) return `reasignó la tarea de ${entry.from} a ${entry.to}`;
      if (entry.to) return `asignó la tarea a ${entry.to}`;
      return `quitó la asignación a ${entry.from ?? "—"}`;
    case "priority":
      return `cambió la prioridad de ${entry.from} a ${entry.to}`;
    case "deadline":
      return entry.to
        ? `cambió la fecha límite a ${deadline(entry.to)}`
        : "quitó la fecha límite";
    case "customer":
      if (entry.to && entry.from) return `cambió el cliente de ${entry.from} a ${entry.to}`;
      if (entry.to) return `añadió el cliente ${entry.to}`;
      return `quitó el cliente ${entry.from ?? ""}`.trim();
    case "customer_notice": {
      // `to` is "<date>|<from>|<to>"; the day is worded relative to when it was logged.
      const [date, from, to] = entry.to?.split("|") ?? [];
      const arrival =
        date && from
          ? arrivalLabel({ date, from, to: to || undefined }, timezone, entry._creationTime)
          : null;
      if (entry.from === "sms") {
        return arrival ? `avisó al cliente (llegada ${arrival})` : "avisó al cliente";
      }
      return arrival
        ? `anotó la llegada estimada (${arrival}) sin avisar al cliente`
        : "movió la tarea sin avisar al cliente";
    }
    case "comment_deleted":
      return `eliminó un comentario de ${entry.from ?? "alguien"}`;
    default:
      return "actualizó la tarea";
  }
}
