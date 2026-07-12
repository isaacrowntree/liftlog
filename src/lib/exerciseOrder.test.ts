import { describe, it, expect } from "vitest";
import type { SetEntry } from "./types";
import { orderExercises } from "./exerciseOrder";

function set(exerciseId: string, completedTs?: number): SetEntry {
  return {
    id: `${exerciseId}-${completedTs ?? 0}`,
    workoutId: "w1",
    userId: "u1",
    exerciseId,
    setIndex: 0,
    isWarmup: false,
    completedTs,
  };
}

/** Sets come out of IndexedDB grouped in exercise-id (primary-key) order — the
 * exact order the workout screen does NOT use. */
function groupsInIdOrder(...exerciseIds: string[]): Map<string, SetEntry[]> {
  const m = new Map<string, SetEntry[]>();
  for (const id of [...exerciseIds].sort()) m.set(id, [set(id)]);
  return m;
}

describe("orderExercises", () => {
  it("orders exercises by program position, not exercise id", () => {
    // Workout lists these as squat(0), bench(1), row(2); their ids sort
    // bench < row < squat, which is the wrong order history was showing.
    const groups = groupsInIdOrder("ex-squat", "ex-bench", "ex-row");
    const position = new Map([
      ["ex-squat", 0],
      ["ex-bench", 1],
      ["ex-row", 2],
    ]);
    expect(orderExercises(groups, position).map(([id]) => id)).toEqual([
      "ex-squat",
      "ex-bench",
      "ex-row",
    ]);
  });

  it("places exercises absent from the program day last, in logged order", () => {
    const groups = new Map<string, SetEntry[]>([
      ["ex-bench", [set("ex-bench", 200)]],
      ["ex-adhoc-late", [set("ex-adhoc-late", 999)]],
      ["ex-adhoc-early", [set("ex-adhoc-early", 100)]],
      ["ex-squat", [set("ex-squat", 300)]],
    ]);
    const position = new Map([
      ["ex-squat", 0],
      ["ex-bench", 1],
    ]);
    // Positioned exercises first (squat, bench), then the ad-hoc ones by the
    // time they were actually logged (early before late).
    expect(orderExercises(groups, position).map(([id]) => id)).toEqual([
      "ex-squat",
      "ex-bench",
      "ex-adhoc-early",
      "ex-adhoc-late",
    ]);
  });

  it("is deterministic when nothing distinguishes two exercises", () => {
    const groups = new Map<string, SetEntry[]>([
      ["ex-b", [set("ex-b")]],
      ["ex-a", [set("ex-a")]],
    ]);
    expect(orderExercises(groups, new Map()).map(([id]) => id)).toEqual(["ex-a", "ex-b"]);
  });
});
