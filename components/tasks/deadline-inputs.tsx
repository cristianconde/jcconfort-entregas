"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DeadlineInput } from "@/convex/lib/deadline";

/** Native date + optional time inputs; mobile browsers show their own pickers. */
export function DeadlineInputs({
  value,
  onChange,
  idPrefix,
}: {
  value: DeadlineInput | null;
  onChange: (value: DeadlineInput | null) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <Input
        id={`${idPrefix}-date`}
        type="date"
        aria-label="Fecha límite"
        value={value?.date ?? ""}
        onChange={(event) =>
          onChange(event.target.value ? { date: event.target.value, time: value?.time } : null)
        }
        className="min-w-0 flex-1 px-2.5"
      />
      <Input
        id={`${idPrefix}-time`}
        type="time"
        aria-label="Hora límite (opcional)"
        value={value?.time ?? ""}
        disabled={!value}
        onChange={(event) =>
          value && onChange({ date: value.date, time: event.target.value || undefined })
        }
        className="w-[7.75rem] shrink-0 px-2.5"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Quitar fecha límite"
          onClick={() => onChange(null)}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
