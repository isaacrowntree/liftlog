import { describe, it, expect } from "vitest";
import { rampForRole, nextTop, topSetIndex } from "./madcow";

describe("rampForRole", () => {
  it("heavy day: 5 ramped ×5 to the top set", () => {
    expect(rampForRole("heavy", 100, 2.5)).toEqual([
      { weightKg: 50, reps: 5, kind: "ramp" },
      { weightKg: 62.5, reps: 5, kind: "ramp" },
      { weightKg: 75, reps: 5, kind: "ramp" },
      { weightKg: 87.5, reps: 5, kind: "ramp" },
      { weightKg: 100, reps: 5, kind: "top" },
    ]);
  });

  it("light day: 3 ramped ×5 to 75%, no top set", () => {
    expect(rampForRole("light", 100, 2.5)).toEqual([
      { weightKg: 50, reps: 5, kind: "ramp" },
      { weightKg: 62.5, reps: 5, kind: "ramp" },
      { weightKg: 75, reps: 5, kind: "ramp" },
    ]);
  });

  it("intensity day: 4 ramped ×5, a PR top set (top+increment)×3, back-off ×8", () => {
    expect(rampForRole("intensity", 100, 2.5)).toEqual([
      { weightKg: 50, reps: 5, kind: "ramp" },
      { weightKg: 62.5, reps: 5, kind: "ramp" },
      { weightKg: 75, reps: 5, kind: "ramp" },
      { weightKg: 87.5, reps: 5, kind: "ramp" },
      { weightKg: 102.5, reps: 3, kind: "top" },
      { weightKg: 75, reps: 8, kind: "backoff" },
    ]);
  });

  it("rounds ramp weights down to the step, top set stays exact", () => {
    const ramp = rampForRole("heavy", 95, 2.5);
    expect(ramp.map((s) => s.weightKg)).toEqual([47.5, 57.5, 70, 82.5, 95]);
  });
});

describe("nextTop", () => {
  it("advances by the increment when the PR set is hit", () => {
    expect(nextTop(100, 2.5, true)).toBe(102.5);
    expect(nextTop(100, 1.25, true)).toBe(101.25);
  });
  it("holds the top when the PR set is missed", () => {
    expect(nextTop(100, 2.5, false)).toBe(100);
  });
});

describe("topSetIndex", () => {
  it("points at the top/PR set (or -1 on light recovery days)", () => {
    expect(topSetIndex("heavy")).toBe(4);
    expect(topSetIndex("intensity")).toBe(4);
    expect(topSetIndex("light")).toBe(-1);
  });
});
