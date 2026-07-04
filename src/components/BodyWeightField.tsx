"use client";

/** Body-weight input for the workout screen. Carry-forward happens at
 * event time — startWorkout() stamps the new workout with the last
 * recorded weight — so this is a plain live-bound input, no effects. */

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";

export function BodyWeightField({ workoutId }: { workoutId: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const stored = useLiveQuery(() => db.workouts.get(workoutId), [workoutId]);
  const value = draft ?? (stored?.bodyWeightKg?.toString() || "");

  return (
    <label className="mt-6 flex items-center justify-between glass px-4 py-3.5">
      <span className="text-[15px]">Body weight</span>
      <span className="flex items-center gap-2">
        <input
          className="setfield max-w-[110px]" autoComplete="off" autoCorrect="off" spellCheck={false} onFocus={(e) => e.currentTarget.select()}
          type="number"
          inputMode="decimal"
          step="0.05"
          enterKeyHint="done"
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="0"
          value={value}
        onChange={async (e) => {
          setDraft(e.target.value);
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v > 0) {
            await db.workouts.update(workoutId, { bodyWeightKg: v });
          }
        }}
        />
        <span className="mono text-[13px] text-ink-dim">kg</span>
      </span>
    </label>
  );
}
