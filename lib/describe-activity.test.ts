import { expect, test } from "vitest";
import { describeActivity } from "./describe-activity";

const timezone = "Europe/Madrid";
// 5 Oct 2026, 09:00 in Madrid.
const _creationTime = Date.UTC(2026, 9, 5, 7, 0);
const describe = (kind: string, from?: string, to?: string) =>
  describeActivity({ kind, from, to, _creationTime }, timezone);

test("customer contact changes", () => {
  expect(describe("customer", undefined, "María García · +34600111222")).toBe(
    "añadió el cliente María García · +34600111222",
  );
  expect(describe("customer", "María García", "María García · +34600111222")).toBe(
    "cambió el cliente de María García a María García · +34600111222",
  );
  expect(describe("customer", "María García")).toBe("quitó el cliente María García");
});

test("customer notice with the SMS sent", () => {
  expect(describe("customer_notice", "sms", "2026-10-05|10:00|12:00")).toBe(
    "avisó al cliente (llegada hoy 10:00–12:00)",
  );
  expect(describe("customer_notice", "sms", "2026-10-06|16:00|")).toBe(
    "avisó al cliente (llegada mañana 16:00)",
  );
  expect(describe("customer_notice", "sms")).toBe("avisó al cliente");
});

test("customer notice without SMS", () => {
  expect(describe("customer_notice", "sin sms", "2026-10-05|16:00|18:00")).toBe(
    "anotó la llegada estimada (hoy 16:00–18:00) sin avisar al cliente",
  );
  expect(describe("customer_notice", "sin sms")).toBe("movió la tarea sin avisar al cliente");
});

test("existing wording is unchanged", () => {
  expect(describe("status", "Pendiente", "En progreso")).toBe(
    "cambió el estado de Pendiente a En progreso",
  );
  expect(describe("created")).toBe("creó la tarea");
});
