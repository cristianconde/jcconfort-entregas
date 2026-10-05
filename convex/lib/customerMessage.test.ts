import { describe, expect, test } from "vitest";
import {
  arrivalLabel,
  arrivalSentence,
  customerMessageError,
  DEFAULT_CUSTOMER_TEMPLATE,
  etaError,
  gsmLength,
  localDate,
  renderCustomerMessage,
  SMS_MAX_SEPTETS,
  templateError,
  toGsm7,
  validateTemplate,
} from "./customerMessage";

const timezone = "Europe/Madrid";
// 5 Oct 2026, 09:00 in Madrid (CEST, UTC+2).
const now = Date.UTC(2026, 9, 5, 7, 0);
const base = { template: DEFAULT_CUSTOMER_TEMPLATE, appName: "JC Confort Entregas", timezone, now };

describe("renderCustomerMessage", () => {
  test("out for delivery with an arrival window", () => {
    expect(
      renderCustomerMessage({
        ...base,
        customerName: "María García",
        eta: { date: "2026-10-05", from: "10:00", to: "12:00" },
      }),
    ).toBe(
      "Hola Maria Garcia, su pedido esta en camino. Llegada estimada: hoy entre las 10:00 y las 12:00. Gracias por su compra. JC Confort Entregas",
    );
  });

  test("no window: no arrival sentence", () => {
    expect(renderCustomerMessage({ ...base, customerName: "María García" })).toBe(
      "Hola Maria Garcia, su pedido esta en camino. Gracias por su compra. JC Confort Entregas",
    );
  });

  test("no customer name: no doubled spaces and no space before the comma", () => {
    const text = renderCustomerMessage(base);
    expect(text).toBe("Hola, su pedido esta en camino. Gracias por su compra. JC Confort Entregas");
    expect(text).not.toMatch(/ {2}| ,/);
    expect(renderCustomerMessage({ ...base, template: "Pedido de {cliente} en camino", customerName: " " })).toBe(
      "Pedido de en camino",
    );
  });

  test("single time, tomorrow and a later date", () => {
    expect(arrivalSentence({ date: "2026-10-05", from: "16:00" }, timezone, now)).toBe(
      " Llegada estimada: hoy hacia las 16:00.",
    );
    expect(arrivalSentence({ date: "2026-10-06", from: "10:00", to: "12:00" }, timezone, now)).toBe(
      " Llegada estimada: mañana entre las 10:00 y las 12:00.",
    );
    expect(arrivalSentence({ date: "2026-10-09", from: "10:00" }, timezone, now)).toBe(
      " Llegada estimada: el 9 de octubre hacia las 10:00.",
    );
    expect(arrivalSentence(undefined, timezone, now)).toBe("");
    // The sent text is GSM-7: "mañana" keeps its ñ.
    expect(
      renderCustomerMessage({ ...base, template: "{llegada}", eta: { date: "2026-10-06", from: "10:00" } }),
    ).toBe("Llegada estimada: mañana hacia las 10:00.");
  });

  test("today is the day in the app timezone, not in UTC", () => {
    // 23:30 UTC on 5 Oct is already 6 Oct in Madrid.
    const late = Date.UTC(2026, 9, 5, 23, 30);
    expect(localDate(late, timezone)).toBe("2026-10-06");
    expect(localDate(late, timezone, 1)).toBe("2026-10-07");
    expect(arrivalSentence({ date: "2026-10-06", from: "09:00" }, timezone, late)).toContain("hoy");
    // Month boundary.
    expect(localDate(Date.UTC(2026, 9, 31, 12), timezone, 1)).toBe("2026-11-01");
  });

  test("compact label for the card", () => {
    expect(arrivalLabel({ date: "2026-10-05", from: "10:00", to: "12:00" }, timezone, now)).toBe(
      "hoy 10:00–12:00",
    );
    expect(arrivalLabel({ date: "2026-10-06", from: "16:00" }, timezone, now)).toBe("mañana 16:00");
    expect(arrivalLabel({ date: "2026-10-09", from: "16:00" }, timezone, now)).toBe("9 oct 16:00");
  });
});

describe("templates", () => {
  test("the default template is valid", () => {
    expect(templateError(DEFAULT_CUSTOMER_TEMPLATE)).toBeNull();
    expect(validateTemplate(`  ${DEFAULT_CUSTOMER_TEMPLATE} `)).toBe(DEFAULT_CUSTOMER_TEMPLATE);
  });

  test("unknown placeholder rejected, naming it", () => {
    expect(templateError("Hola {nombre}, va en camino")).toBe("Marcador desconocido: {nombre}");
    expect(() => validateTemplate("Hola {nombre}, va en camino")).toThrow("Marcador desconocido: {nombre}");
  });

  test("1–306 characters", () => {
    expect(templateError("   ")).toMatch(/entre 1 y 306/);
    expect(templateError("a".repeat(306))).toBeNull();
    expect(templateError("a".repeat(307))).toMatch(/entre 1 y 306/);
  });
});

describe("message limits", () => {
  test("a 307-septet message is too long; 306 fits", () => {
    expect(customerMessageError("a".repeat(SMS_MAX_SEPTETS))).toBeNull();
    expect(customerMessageError("a".repeat(SMS_MAX_SEPTETS + 1))).toBe(
      "El mensaje es demasiado largo (máximo 2 SMS)",
    );
    // Extension-table characters take two septets each.
    expect(gsmLength("€".repeat(153))).toBe(306);
    expect(customerMessageError("€".repeat(154))).toBe("El mensaje es demasiado largo (máximo 2 SMS)");
  });

  test("empty message rejected", () => {
    expect(customerMessageError("  ")).toBe("El mensaje no puede estar vacío");
  });

  test("normalizes to GSM-7: á í ó ú and «» change, é ñ ü stay", () => {
    expect(toGsm7("Árbol, camión, «Peña» güe é … – x")).toBe('Arbol, camion, "Peña" güe é ... - x');
    expect(toGsm7("emoji 🚚")).toBe("emoji ?");
  });
});

describe("etaError", () => {
  test("accepts today and later, a window or a single time", () => {
    expect(etaError({ date: "2026-10-05", from: "10:00", to: "12:00" }, timezone, now)).toBeNull();
    expect(etaError({ date: "2026-10-20", from: "08:30" }, timezone, now)).toBeNull();
  });

  test("end must be after start", () => {
    expect(etaError({ date: "2026-10-05", from: "12:00", to: "10:00" }, timezone, now)).toMatch(/posterior/);
    expect(etaError({ date: "2026-10-05", from: "12:00", to: "12:00" }, timezone, now)).toMatch(/posterior/);
  });

  test("the day can't be in the past", () => {
    expect(etaError({ date: "2026-10-04", from: "10:00" }, timezone, now)).toBe(
      "El día de llegada no puede ser anterior a hoy",
    );
  });

  test("malformed values", () => {
    expect(etaError({ date: "05/10/2026", from: "10:00" }, timezone, now)).toMatch(/día/);
    expect(etaError({ date: "2026-02-30", from: "10:00" }, timezone, now)).toMatch(/día/);
    expect(etaError({ date: "2026-10-05", from: "25:00" }, timezone, now)).toMatch(/hora/);
  });
});
