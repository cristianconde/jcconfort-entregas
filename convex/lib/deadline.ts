import { TZDate } from "@date-fns/tz";
import { ConvexError } from "convex/values";

// Shared by Convex functions and the client: keep this file dependency-light.

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type DeadlineInput = { date: string; time?: string };

/**
 * Converts a calendar date (and optional HH:mm) in `timezone` to a UTC
 * timestamp. Date-only deadlines end at 23:59:59.999 local time.
 */
export function toDeadlineAt({ date, time }: DeadlineInput, timezone: string): number {
  const d = DATE.exec(date);
  if (!d) throw new ConvexError("La fecha límite no es válida");
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  let hours = 23;
  let minutes = 59;
  let seconds = 59;
  let ms = 999;
  if (time) {
    const t = TIME.exec(time);
    if (!t) throw new ConvexError("La hora límite no es válida");
    [hours, minutes, seconds, ms] = [Number(t[1]), Number(t[2]), 0, 0];
  }
  const result = new TZDate(year, month - 1, day, hours, minutes, seconds, ms, timezone);
  if (result.getMonth() !== month - 1 || result.getDate() !== day) {
    throw new ConvexError("La fecha límite no es válida");
  }
  return result.getTime();
}

/** Inverse of toDeadlineAt, for pre-filling date/time inputs. */
export function fromDeadlineAt(
  deadlineAt: number,
  hasTime: boolean,
  timezone: string,
): DeadlineInput {
  const local = new TZDate(deadlineAt, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
  return hasTime ? { date, time: `${pad(local.getHours())}:${pad(local.getMinutes())}` } : { date };
}

/** Human-readable Spanish deadline, e.g. "5 oct 2026" or "5 oct 2026, 14:30". */
export function formatDeadline(deadlineAt: number, hasTime: boolean, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: timezone,
  }).format(deadlineAt);
}
