import { describe, it, expect } from "vitest";
import {
  setRecordValue,
  sessionBests,
  prWorkoutIds,
  personalBest,
  isNewPR,
  type RecordSet,
} from "./records";

/** Build a work set for a given workout. */
const s = (
  workoutId: string,
  ts: number,
  v: Partial<RecordSet> = {},
): RecordSet => ({
  workoutId,
  completedTs: ts,
  isWarmup: false,
  ...v,
});

describe("setRecordValue (record metric per kind)", () => {
  it("weighted → estimated 1RM (Epley)", () => {
    expect(setRecordValue("weighted", s("w", 1, { weightKg: 100, reps: 5 }))).toBe(
      116.7,
    );
  });
  it("bodyweight → reps", () => {
    expect(setRecordValue("bodyweight", s("w", 1, { reps: 12 }))).toBe(12);
  });
  it("timed → seconds", () => {
    expect(setRecordValue("timed", s("w", 1, { seconds: 60 }))).toBe(60);
  });
});

describe("sessionBests", () => {
  it("takes the best work set per workout, excludes warmups, sorts by time", () => {
    const sets = [
      s("a", 100, { weightKg: 60, reps: 5 }),
      s("a", 101, { weightKg: 60, reps: 3 }),
      s("a", 90, { weightKg: 40, reps: 5, isWarmup: true }), // ignored
      s("b", 200, { weightKg: 62.5, reps: 5 }),
    ];
    const bests = sessionBests("weighted", sets);
    expect(bests.map((b) => b.workoutId)).toEqual(["a", "b"]);
    expect(bests[0].value).toBe(70); // epley(60,5)
    expect(bests[1].value).toBe(72.9); // epley(62.5,5)
  });
});

describe("prWorkoutIds (running max, strict)", () => {
  const sets = [
    s("a", 100, { weightKg: 60, reps: 5 }), // baseline — not a PR
    s("b", 200, { weightKg: 65, reps: 5 }), // up — PR
    s("c", 300, { weightKg: 65, reps: 5 }), // tie — not a PR
    s("d", 400, { weightKg: 62.5, reps: 5 }), // down — not a PR
    s("e", 500, { weightKg: 70, reps: 5 }), // new high — PR
  ];
  it("flags only workouts that strictly beat every earlier one", () => {
    expect(prWorkoutIds("weighted", sets)).toEqual(new Set(["b", "e"]));
  });
  it("never flags the first-ever session", () => {
    expect(prWorkoutIds("weighted", [sets[0]])).toEqual(new Set());
  });
});

describe("personalBest", () => {
  it("returns the max value and the earliest workout that hit it", () => {
    const sets = [
      s("a", 100, { weightKg: 60, reps: 5 }),
      s("b", 200, { weightKg: 70, reps: 5 }),
      s("c", 300, { weightKg: 70, reps: 5 }), // ties the max, but later
    ];
    expect(personalBest("weighted", sets)).toEqual({
      value: 81.7,
      workoutId: "b",
      ts: 200,
    });
  });
  it("is null with no scoring sets", () => {
    expect(personalBest("weighted", [])).toBeNull();
  });
});

describe("isNewPR (latest session beats all prior)", () => {
  it("true when the most recent workout is an all-time best", () => {
    const sets = [
      s("a", 100, { weightKg: 60, reps: 5 }),
      s("b", 200, { weightKg: 65, reps: 5 }),
    ];
    expect(isNewPR("weighted", sets)).toBe(true);
  });
  it("false when the most recent workout is not a best", () => {
    const sets = [
      s("a", 100, { weightKg: 65, reps: 5 }),
      s("b", 200, { weightKg: 60, reps: 5 }),
    ];
    expect(isNewPR("weighted", sets)).toBe(false);
  });
  it("false for a single session", () => {
    expect(isNewPR("weighted", [s("a", 100, { weightKg: 60, reps: 5 })])).toBe(false);
  });
  it("keys on reps for bodyweight", () => {
    const sets = [
      s("a", 100, { reps: 10 }),
      s("b", 200, { reps: 12 }),
    ];
    expect(isNewPR("bodyweight", sets)).toBe(true);
  });
});
