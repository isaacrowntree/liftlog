import { describe, it, expect } from "vitest";
import { sessionSeries } from "./progressStats";
import type { RecordSet } from "./records";

const s = (
  workoutId: string,
  ts: number,
  v: Partial<RecordSet> = {},
): RecordSet => ({ workoutId, completedTs: ts, isWarmup: false, ...v });

describe("sessionSeries", () => {
  it("rolls each workout's work sets into one point, sorted by time", () => {
    const sets = [
      s("b", 200, { weightKg: 65, reps: 5 }),
      s("a", 100, { weightKg: 60, reps: 5 }),
      s("a", 101, { weightKg: 60, reps: 5 }),
    ];
    const series = sessionSeries(sets);
    expect(series.map((p) => p.workoutId)).toEqual(["a", "b"]);
  });

  it("excludes warmups from every metric", () => {
    const sets = [
      s("a", 90, { weightKg: 20, reps: 5, isWarmup: true }),
      s("a", 100, { weightKg: 60, reps: 5 }),
      s("a", 101, { weightKg: 60, reps: 5 }),
    ];
    const [p] = sessionSeries(sets);
    expect(p.weightTop).toBe(60);
    expect(p.volume).toBe(600); // 60*5 + 60*5, warmup ignored
    expect(p.repsTotal).toBe(10);
  });

  it("computes top set, e1RM, volume, reps", () => {
    const sets = [
      s("a", 100, { weightKg: 100, reps: 5 }),
      s("a", 101, { weightKg: 100, reps: 3 }),
    ];
    const [p] = sessionSeries(sets);
    expect(p.weightTop).toBe(100);
    expect(p.e1rm).toBe(116.7); // best of epley(100,5)=116.7, epley(100,3)=110
    expect(p.volume).toBe(800); // 100*5 + 100*3
    expect(p.repsTotal).toBe(8);
    expect(p.repsTop).toBe(5);
  });

  it("counts machine assistance (negative weight) as zero moved, not negative", () => {
    const [p] = sessionSeries([s("a", 100, { weightKg: -20, reps: 10 })]);
    expect(p.volume).toBe(0);
    expect(p.weightTop).toBe(0);
    expect(p.repsTotal).toBe(10);
  });

  it("sums seconds and tracks the best hold for timed work", () => {
    const sets = [
      s("a", 100, { seconds: 45 }),
      s("a", 101, { seconds: 60 }),
    ];
    const [p] = sessionSeries(sets);
    expect(p.secondsTotal).toBe(105);
    expect(p.secondsTop).toBe(60);
  });

  it("is empty for no sets", () => {
    expect(sessionSeries([])).toEqual([]);
  });
});
