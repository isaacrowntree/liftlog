/** Personal-record detection. Pure functions over one exercise's sets.
 *
 * The record metric depends on the exercise kind: a weighted lift's record is
 * its best estimated 1RM (so a heavy triple can out-rank a lighter 5×5), a
 * bodyweight lift's is its best rep count, a timed hold's is its longest hold.
 * A "PR" is a workout whose best strictly beats every earlier workout — the
 * first time you ever do a lift establishes the baseline, it isn't a PR. */

import { epley } from "./e1rm";
import type { ExerciseKind, SetEntry } from "./types";

export type RecordSet = Pick<
  SetEntry,
  "weightKg" | "reps" | "seconds" | "isWarmup" | "completedTs" | "workoutId"
>;

export interface SessionBest {
  workoutId: string;
  ts: number;
  value: number;
}

/** The record-worthy value of a single set for this exercise's kind. */
export function setRecordValue(kind: ExerciseKind, set: RecordSet): number {
  if (kind === "timed") return set.seconds ?? 0;
  if (kind === "bodyweight") return set.reps ?? 0;
  return epley(set.weightKg ?? 0, set.reps ?? 0);
}

/** Best work-set value per workout (warmups excluded), oldest → newest. */
export function sessionBests(kind: ExerciseKind, sets: RecordSet[]): SessionBest[] {
  const byWorkout = new Map<string, { ts: number; value: number }>();
  for (const set of sets) {
    if (set.isWarmup) continue;
    const value = setRecordValue(kind, set);
    const ts = set.completedTs ?? 0;
    const cur = byWorkout.get(set.workoutId);
    if (!cur) byWorkout.set(set.workoutId, { ts, value });
    else
      byWorkout.set(set.workoutId, {
        ts: Math.max(cur.ts, ts),
        value: Math.max(cur.value, value),
      });
  }
  return [...byWorkout.entries()]
    .map(([workoutId, v]) => ({ workoutId, ts: v.ts, value: v.value }))
    .sort((a, b) => a.ts - b.ts);
}

/** Workouts whose best strictly beats every earlier workout (running max).
 * The first scoring session is the baseline and is never a PR. */
export function prWorkoutIds(kind: ExerciseKind, sets: RecordSet[]): Set<string> {
  const bests = sessionBests(kind, sets).filter((b) => b.value > 0);
  const prs = new Set<string>();
  let max = -Infinity;
  for (const b of bests) {
    if (max !== -Infinity && b.value > max) prs.add(b.workoutId);
    if (b.value > max) max = b.value;
  }
  return prs;
}

/** All-time best value + the earliest workout that reached it. */
export function personalBest(
  kind: ExerciseKind,
  sets: RecordSet[],
): { value: number; workoutId: string; ts: number } | null {
  const bests = sessionBests(kind, sets).filter((b) => b.value > 0);
  if (bests.length === 0) return null;
  const max = Math.max(...bests.map((b) => b.value));
  const first = bests
    .filter((b) => b.value === max)
    .sort((a, b) => a.ts - b.ts)[0];
  return { value: max, workoutId: first.workoutId, ts: first.ts };
}

/** Is the most recent scoring session an all-time best? */
export function isNewPR(kind: ExerciseKind, sets: RecordSet[]): boolean {
  const bests = sessionBests(kind, sets).filter((b) => b.value > 0);
  if (bests.length < 2) return false;
  return prWorkoutIds(kind, sets).has(bests[bests.length - 1].workoutId);
}
