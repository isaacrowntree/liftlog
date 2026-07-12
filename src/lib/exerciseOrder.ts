/** Ordering a workout's exercises to match the workout screen.
 *
 * Views that read sets straight from IndexedDB get them in primary-key order
 * (`workoutId#exerciseId#setIndex`), so grouping by exercise lands in
 * exercise-id order — alphabetical, unrelated to how the workout lists them.
 * The workout screen lists exercises by the program day's `position`, so
 * History and friends must sort by the same key to stay consistent. */

import type { SetEntry } from "./types";

/** Sort grouped exercises by program position; exercises no longer in the
 * program day fall to the end in the order they were actually logged. */
export function orderExercises(
  groups: Map<string, SetEntry[]>,
  positionByExercise: Map<string, number>,
): [string, SetEntry[]][] {
  return [...groups.entries()].sort(([aId, aSets], [bId, bSets]) => {
    const pa = positionByExercise.get(aId) ?? Infinity;
    const pb = positionByExercise.get(bId) ?? Infinity;
    if (pa !== pb) return pa - pb;
    const ta = firstLoggedTs(aSets);
    const tb = firstLoggedTs(bSets);
    if (ta !== tb) return ta - tb;
    return aId < bId ? -1 : aId > bId ? 1 : 0; // last-resort stable tiebreak
  });
}

function firstLoggedTs(sets: SetEntry[]): number {
  let min = Infinity;
  for (const s of sets) {
    const ts = s.completedTs ?? Infinity;
    if (ts < min) min = ts;
  }
  return min;
}
