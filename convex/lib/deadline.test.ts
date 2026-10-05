import { expect, test } from "vitest";
import { formatDeadline, fromDeadlineAt, toDeadlineAt } from "./deadline";

test("date-only deadline ends at 23:59:59.999 in the app timezone", () => {
  // Madrid is UTC+2 in October (CEST).
  expect(toDeadlineAt({ date: "2026-10-05" }, "Europe/Madrid")).toBe(
    Date.UTC(2026, 9, 5, 21, 59, 59, 999),
  );
});

test("deadline with time is interpreted in the app timezone", () => {
  // Madrid is UTC+1 in December (CET).
  expect(toDeadlineAt({ date: "2026-12-01", time: "09:30" }, "Europe/Madrid")).toBe(
    Date.UTC(2026, 11, 1, 8, 30),
  );
});

test("invalid dates and times are rejected", () => {
  expect(() => toDeadlineAt({ date: "2026-02-30" }, "Europe/Madrid")).toThrow("no es válida");
  expect(() => toDeadlineAt({ date: "05/10/2026" }, "Europe/Madrid")).toThrow("no es válida");
  expect(() => toDeadlineAt({ date: "2026-10-05", time: "25:00" }, "Europe/Madrid")).toThrow(
    "La hora límite no es válida",
  );
});

test("round-trips and formats in Spanish", () => {
  const at = toDeadlineAt({ date: "2026-10-05", time: "14:30" }, "Europe/Madrid");
  expect(fromDeadlineAt(at, true, "Europe/Madrid")).toEqual({ date: "2026-10-05", time: "14:30" });
  const dateOnly = toDeadlineAt({ date: "2026-10-05" }, "Europe/Madrid");
  expect(fromDeadlineAt(dateOnly, false, "Europe/Madrid")).toEqual({ date: "2026-10-05" });
  expect(formatDeadline(at, true, "Europe/Madrid")).toMatch(/5 oct 2026.*14:30/);
});
