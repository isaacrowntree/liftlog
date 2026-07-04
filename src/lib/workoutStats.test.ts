import { describe, it, expect } from "vitest";
import { sessionTonnageKg, workSetCount } from "./workoutStats";
import type { SetEntry } from "./types";

function set(partial: Partial<SetEntry>): SetEntry {
  return {
    id: "s",
    workoutId: "w",
    userId: "u",
    exerciseId: "e",
    setIndex: 0,
    isWarmup: false,
    ...partial,
  };
}

describe("sessionTonnageKg", () => {
  it("sums weight × reps across all sets", () => {
    expect(
      sessionTonnageKg([
        set({ weightKg: 100, reps: 5 }),
        set({ weightKg: 60, reps: 5 }),
      ]),
    ).toBe(800);
  });

  it("includes warmups (they are still weight moved)", () => {
    expect(
      sessionTonnageKg([
        set({ weightKg: 20, reps: 5, isWarmup: true }),
        set({ weightKg: 40, reps: 5, isWarmup: false }),
      ]),
    ).toBe(300);
  });

  it("counts assisted (negative) weight as zero, not a subtraction", () => {
    expect(
      sessionTonnageKg([
        set({ weightKg: -15, reps: 10 }), // assisted pull-ups → 0
        set({ weightKg: 50, reps: 5 }),
      ]),
    ).toBe(250);
  });

  it("treats missing weight or reps as zero", () => {
    expect(
      sessionTonnageKg([
        set({ reps: 10 }), // bodyweight, no weight
        set({ weightKg: 40 }), // no reps logged
      ]),
    ).toBe(0);
  });

  it("is zero for an empty session", () => {
    expect(sessionTonnageKg([])).toBe(0);
  });
});

describe("workSetCount", () => {
  it("counts only non-warmup sets", () => {
    expect(
      workSetCount([
        set({ isWarmup: true }),
        set({ isWarmup: true }),
        set({ isWarmup: false }),
        set({ isWarmup: false }),
        set({ isWarmup: false }),
      ]),
    ).toBe(3);
  });

  it("is zero when only warmups were logged", () => {
    expect(workSetCount([set({ isWarmup: true })])).toBe(0);
  });
});
