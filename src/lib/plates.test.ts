import { describe, it, expect } from "vitest";
import { platesPerSide, warmupRamp, DEFAULT_PLATES } from "./plates";

describe("platesPerSide", () => {
  it("loads 120kg as 20+20+10 per side on a 20kg bar", () => {
    expect(platesPerSide(120, 20, DEFAULT_PLATES)).toEqual([20, 20, 10]);
  });

  it("loads 27.5kg as 2.5+1.25 per side", () => {
    expect(platesPerSide(27.5, 20, DEFAULT_PLATES)).toEqual([2.5, 1.25]);
  });

  it("returns empty for an empty bar", () => {
    expect(platesPerSide(20, 20, DEFAULT_PLATES)).toEqual([]);
  });

  it("prefers big plates greedily", () => {
    expect(platesPerSide(100, 20, DEFAULT_PLATES)).toEqual([20, 20]);
  });

  it("returns null when the weight is not loadable with available plates", () => {
    expect(platesPerSide(21, 20, DEFAULT_PLATES)).toBeNull();
  });
});

describe("warmupRamp (SL protocol)", () => {
  it("generates the SL ramp for a 40kg overhead press (bar lift)", () => {
    expect(warmupRamp(40, 20, "bar")).toEqual([
      { reps: 5, weightKg: 20 },
      { reps: 5, weightKg: 20 },
      { reps: 3, weightKg: 30 },
    ]);
  });

  it("always starts bar lifts with two empty-bar sets, even on long spans", () => {
    const ramp = warmupRamp(62.5, 20, "bar");
    expect(ramp[0]).toEqual({ reps: 5, weightKg: 20 });
    expect(ramp[1]).toEqual({ reps: 5, weightKg: 20 });
    expect(ramp.length).toBeGreaterThan(3);
    expect(ramp.every((w) => w.weightKg < 62.5)).toBe(true);
  });

  it("generates the SL ramp for a 120kg deadlift (floor pull, no empty bar)", () => {
    expect(warmupRamp(120, 20, "floor")).toEqual([
      { reps: 5, weightKg: 60 },
      { reps: 5, weightKg: 80 },
      { reps: 3, weightKg: 100 },
      { reps: 2, weightKg: 110 },
    ]);
  });

  it("floor pulls never include empty-bar sets", () => {
    const ramp = warmupRamp(80, 20, "floor");
    expect(ramp.every((w) => w.weightKg >= 40)).toBe(true);
  });

  it("doesn't bother warming up light floor pulls (weight can't ramp)", () => {
    expect(warmupRamp(30, 20, "floor")).toEqual([]);
    expect(warmupRamp(40, 20, "floor")).toEqual([]);
  });

  it("returns no warmups at or below bar weight", () => {
    expect(warmupRamp(20, 20, "bar")).toEqual([]);
    expect(warmupRamp(25, 20, "bar")).toEqual([]);
  });
});
