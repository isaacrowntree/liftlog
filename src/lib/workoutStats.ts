/** Session roll-ups derived from a workout's logged sets. */

import type { SetEntry } from "./types";

/** Total weight moved in a session: Σ weight × reps, warmups included.
 * Assisted (negative) weights count as 0 — machine assistance doesn't
 * subtract from what you actually moved. */
export function sessionTonnageKg(sets: SetEntry[]): number {
  return sets.reduce(
    (kg, s) => kg + Math.max(0, s.weightKg ?? 0) * (s.reps ?? 0),
    0,
  );
}

/** Count of logged work sets (warmups excluded) — drives whether a workout
 * saves on finish and whether the congrats card shows. */
export function workSetCount(sets: SetEntry[]): number {
  return sets.filter((s) => !s.isWarmup).length;
}
