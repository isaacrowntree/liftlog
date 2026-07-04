/** Plate math + StrongLifts-style warmup ramps. */

/** Default pairs available per side, descending (SL-style gym: 20s are the
 * biggest plate; add 25s in settings if the gym has them). */
export const DEFAULT_PLATES = [20, 15, 10, 5, 2.5, 1.25];

/** IWF plate color per kg denomination — the app's palette. */
export const PLATE_COLORS: Record<number, string> = {
  25: "#E8433F",
  20: "#3D6DFF",
  15: "#F2C21B",
  10: "#34C979",
  5: "#EAEAEA",
  2.5: "#E8433F",
  1.25: "#9AA0AB",
};

/**
 * Greedy per-side plate breakdown. Returns null when not exactly loadable.
 */
export function platesPerSide(
  totalKg: number,
  barKg: number,
  available: number[] = DEFAULT_PLATES,
): number[] | null {
  let perSide = (totalKg - barKg) / 2;
  if (perSide < 0) return null;
  const result: number[] = [];
  for (const plate of [...available].sort((a, b) => b - a)) {
    while (perSide >= plate - 1e-9) {
      result.push(plate);
      perSide -= plate;
    }
  }
  return Math.abs(perSide) < 1e-9 ? result : null;
}

export interface WarmupSet {
  reps: number;
  weightKg: number;
}

export type WarmupStyle = "bar" | "floor";

/**
 * StrongLifts warmup protocol (per stronglifts.com):
 * - Bar lifts (squat/bench/OHP): 2×5 with the empty bar, then heavier sets
 *   up to the work weight. Nothing to do within 5kg of the bar.
 * - Floor pulls (deadlift/row): no empty bar — the plates must rest on the
 *   floor, so start around half the work weight (min 40kg) and ramp.
 *   Light floor pulls skip warmups entirely ("don't bother").
 * Ramp steps run 5/5/3/2 reps at ½, ⅔, ⅚, 11⁄12 of the work weight.
 */
export function warmupRamp(
  workKg: number,
  barKg: number,
  style: WarmupStyle = "bar",
): WarmupSet[] {
  const round = (w: number) => Math.round(w / 2.5) * 2.5;
  const fractions: Array<[number, number]> = [
    [1 / 2, 5],
    [2 / 3, 5],
    [5 / 6, 3],
    [11 / 12, 2],
  ];

  if (style === "floor") {
    const start = Math.max(40, round(workKg / 2));
    if (workKg <= start) return [];
    const ramp: WarmupSet[] = [];
    for (const [f, reps] of fractions) {
      const w = Math.max(start, round(workKg * f));
      if (w >= workKg) continue;
      if (ramp.length > 0 && w <= ramp[ramp.length - 1].weightKg) continue;
      ramp.push({ reps, weightKg: w });
    }
    return ramp;
  }

  // Bar lift
  if (workKg <= barKg + 5) return [];
  const barSets: WarmupSet[] = [
    { reps: 5, weightKg: barKg },
    { reps: 5, weightKg: barKg },
  ];
  if (workKg - barKg <= 25) {
    return [...barSets, { reps: 3, weightKg: round((barKg + workKg) / 2) }];
  }
  const ramp: WarmupSet[] = [...barSets];
  for (const [f, reps] of fractions) {
    const w = round(workKg * f);
    if (w <= barKg + 5 || w >= workKg) continue;
    if (w <= ramp[ramp.length - 1].weightKg) continue;
    ramp.push({ reps, weightKg: w });
  }
  return ramp;
}
