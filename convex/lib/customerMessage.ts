import { TZDate } from "@date-fns/tz";
import { ConvexError } from "convex/values";

// Shared by Convex functions and the client (live preview of the customer
// SMS): keep this file dependency-light.

// Two concatenated GSM-7 segments of 153 septets each.
export const SMS_MAX_SEPTETS = 306;

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Extension table: allowed, but each takes two septets.
const GSM_EXTENDED = "^{}\\[~]|€";

const REPLACEMENTS: Record<string, string> = {
  "«": '"',
  "»": '"',
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
  "…": "...",
  "–": "-",
  "—": "-",
  "·": ".",
};

/**
 * Keeps the SMS in the GSM-7 alphabet: one character outside it switches the
 * whole message to UCS-2 (67 instead of 153 characters per segment).
 * á/í/ó/ú lose their accent; é, ñ and ü are GSM-7 and are kept.
 */
export function toGsm7(text: string) {
  let out = "";
  for (const char of text) {
    if (GSM_BASIC.includes(char) || GSM_EXTENDED.includes(char)) {
      out += char;
    } else if (REPLACEMENTS[char] !== undefined) {
      out += REPLACEMENTS[char];
    } else {
      const base = char.normalize("NFD").replace(/\p{Diacritic}/gu, "");
      out += [...base].every((c) => GSM_BASIC.includes(c)) && base ? base : "?";
    }
  }
  return out;
}

export function gsmLength(text: string) {
  let length = 0;
  for (const char of text) length += GSM_EXTENDED.includes(char) ? 2 : 1;
  return length;
}

// ---------------------------------------------------------------------------
// Templates

export const DEFAULT_CUSTOMER_TEMPLATE =
  "Hola {cliente}, su pedido está en camino.{llegada} Gracias por su compra. {empresa}";

export const TEMPLATE_PLACEHOLDERS = [
  { name: "{cliente}", description: "nombre del cliente" },
  { name: "{llegada}", description: "frase con la llegada estimada (vacía si no se indica)" },
  { name: "{empresa}", description: "nombre de la aplicación" },
] as const;

const PLACEHOLDER = /\{([^{}]*)\}/g;
const KNOWN = new Set<string>(TEMPLATE_PLACEHOLDERS.map((p) => p.name));

/** The reason a template can't be saved, or null when it is valid. */
export function templateError(template: string): string | null {
  const value = template.trim();
  if (value.length < 1 || value.length > SMS_MAX_SEPTETS) {
    return `El mensaje para el cliente debe tener entre 1 y ${SMS_MAX_SEPTETS} caracteres`;
  }
  for (const match of value.matchAll(PLACEHOLDER)) {
    if (!KNOWN.has(match[0])) return `Marcador desconocido: ${match[0]}`;
  }
  return null;
}

/** Returns the trimmed template; throws when it is not valid. */
export function validateTemplate(template: string): string {
  const error = templateError(template);
  if (error) throw new ConvexError(error);
  return template.trim();
}

// ---------------------------------------------------------------------------
// Estimated arrival window

/** A day ("YYYY-MM-DD") and a start time, plus an optional end ("HH:mm"), in the app timezone. */
export type Eta = { date: string; from: string; to?: string };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar day of `at` in `timezone`, plus `addDays`, as "YYYY-MM-DD". */
export function localDate(at: number, timezone: string, addDays = 0): string {
  const local = new TZDate(at, timezone);
  // Day arithmetic in UTC: only the calendar date matters here.
  const day = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate() + addDays));
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
}

/** The reason an arrival window is not valid at `now`, or null. */
export function etaError(eta: Eta, timezone: string, now: number): string | null {
  const d = DATE.exec(eta.date);
  const real =
    d && new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]))).getUTCDate() === Number(d[3]);
  if (!d || !real) return "El día de llegada no es válido";
  if (!TIME.test(eta.from) || (eta.to !== undefined && !TIME.test(eta.to))) {
    return "La hora de llegada no es válida";
  }
  if (eta.to !== undefined && eta.to <= eta.from) {
    return "La hora «hasta» debe ser posterior a la hora «desde»";
  }
  if (eta.date < localDate(now, timezone)) return "El día de llegada no puede ser anterior a hoy";
  return null;
}

/** "hoy", "mañana" or the date ("el 5 de octubre"), relative to `now` in `timezone`. */
function dayPhrase(date: string, timezone: string, now: number, style: "long" | "short") {
  if (date === localDate(now, timezone)) return "hoy";
  if (date === localDate(now, timezone, 1)) return "mañana";
  const d = DATE.exec(date);
  if (!d) return date;
  const month = MONTHS[Number(d[2]) - 1] ?? "";
  return style === "long" ? `el ${Number(d[3])} de ${month}` : `${Number(d[3])} ${month.slice(0, 3)}`;
}

/**
 * The `{llegada}` sentence, with its leading space: " Llegada estimada: hoy
 * entre las 10:00 y las 12:00." Empty when there is no window.
 */
export function arrivalSentence(eta: Eta | undefined, timezone: string, now: number): string {
  if (!eta) return "";
  const day = dayPhrase(eta.date, timezone, now, "long");
  return eta.to
    ? ` Llegada estimada: ${day} entre las ${eta.from} y las ${eta.to}.`
    : ` Llegada estimada: ${day} hacia las ${eta.from}.`;
}

/** Compact window for the task card and the activity log: "hoy 10:00–12:00". */
export function arrivalLabel(eta: Eta, timezone: string, now: number): string {
  const day = dayPhrase(eta.date, timezone, now, "short");
  return `${day} ${eta.from}${eta.to ? `–${eta.to}` : ""}`;
}

/** The window stored on a task, if any. */
export function etaOf(task: { etaDate?: string; etaFrom?: string; etaTo?: string }): Eta | undefined {
  if (!task.etaDate || !task.etaFrom) return undefined;
  return { date: task.etaDate, from: task.etaFrom, to: task.etaTo };
}

// ---------------------------------------------------------------------------
// Message

/**
 * Fills a template for one task and normalizes it to GSM-7. A missing customer
 * name leaves no doubled spaces and no space before punctuation.
 */
export function renderCustomerMessage(args: {
  template: string;
  customerName?: string;
  appName: string;
  eta?: Eta;
  timezone: string;
  now: number;
}): string {
  const values: Record<string, string> = {
    "{cliente}": args.customerName?.trim() ?? "",
    "{llegada}": arrivalSentence(args.eta, args.timezone, args.now),
    "{empresa}": args.appName,
  };
  const text = args.template
    .replace(PLACEHOLDER, (match) => values[match] ?? match)
    .replace(/[ \t]+/g, " ")
    .replace(/ ([,.;:!?])/g, "$1")
    .trim();
  return toGsm7(text);
}

/** The reason a message (already in GSM-7) can't be sent, or null. */
export function customerMessageError(message: string): string | null {
  if (message.trim().length === 0) return "El mensaje no puede estar vacío";
  if (gsmLength(message) > SMS_MAX_SEPTETS) return "El mensaje es demasiado largo (máximo 2 SMS)";
  return null;
}
