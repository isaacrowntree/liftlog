/** Madcow 5×5 engine (intermediate program). Pure functions, unit-tested.
 *
 * Unlike linear 5×5's flat working weight, Madcow ramps the weight up each set
 * to a top, and progresses the top WEEKLY. Three day roles per lift:
 *   heavy      — 5 ramped ×5 up to the top (the current 5RM)
 *   light      — 3 ramped ×5 to 75% (recovery, no top set)
 *   intensity  — 4 ramped ×5, then a PR set (top + weekly increment) ×3,
 *                then a back-off ×8 at 75%
 * The PR set on the intensity day becomes next week's top. */

import { roundToIncrement } from "./progression";

export type MadcowRole = "heavy" | "light" | "intensity";
export type RampKind = "ramp" | "top" | "backoff";

export interface RampSet {
  weightKg: number;
  reps: number;
  kind: RampKind;
}

/** Ramp fractions of the top for each role's warm-up climb. */
const RAMP_FRACTIONS: Record<MadcowRole, number[]> = {
  heavy: [0.5, 0.625, 0.75, 0.875],
  light: [0.5, 0.625, 0.75],
  intensity: [0.5, 0.625, 0.75, 0.875],
};

/** The prescribed sets for one lift on a day of the given role. */
export function rampForRole(
  role: MadcowRole,
  topKg: number,
  incrementKg: number,
  step = 2.5,
): RampSet[] {
  const ramp: RampSet[] = RAMP_FRACTIONS[role].map((f) => ({
    weightKg: roundToIncrement(topKg * f, step),
    reps: 5,
    kind: "ramp" as const,
  }));

  if (role === "light") return ramp;

  if (role === "heavy") {
    // The 4th ramp fraction (0.875) is the last climb; the top set is 100%.
    return [...ramp, { weightKg: topKg, reps: 5, kind: "top" }];
  }

  // intensity: PR set at top + increment, then a back-off single at 75%.
  return [
    ...ramp,
    { weightKg: topKg + incrementKg, reps: 3, kind: "top" },
    { weightKg: roundToIncrement(topKg * 0.75, step), reps: 8, kind: "backoff" },
  ];
}

/** Next week's top: advance by the increment on a hit, hold on a miss. */
export function nextTop(topKg: number, incrementKg: number, prSucceeded: boolean): number {
  return prSucceeded ? topKg + incrementKg : topKg;
}

/** Index of the top/PR set within rampForRole's output (-1 on light days). */
export function topSetIndex(role: MadcowRole): number {
  return role === "light" ? -1 : RAMP_FRACTIONS[role].length;
}
