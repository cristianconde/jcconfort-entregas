"use client";

import { useEffect, useState } from "react";

const MINUTE = 60_000;

const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/**
 * Current time rounded down to the minute, refreshed every minute. Passed to
 * Convex queries that depend on "now" (queries must not read the clock), and
 * rounded so the query arguments — and its cache — only change once a minute.
 */
export function useNow(): number {
  const [now, setNow] = useState(currentMinute);
  useEffect(() => {
    const id = setInterval(() => setNow(currentMinute()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
