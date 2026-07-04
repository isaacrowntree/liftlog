import { describe, it, expect } from "vitest";
import { nextWorkingWeight, roundToIncrement, type SessionResult } from "./progression";

const squat = {
  incrementKg: 2.5,
  deloadPct: 0.1,
  deloadAfterFails: 3,
};

function session(weightKg: number, allRepsHit: boolean): SessionResult {
  return { weightKg, success: allRepsHit };
}

describe("nextWorkingWeight (program mode)", () => {
  it("adds the increment after a successful session", () => {
    expect(nextWorkingWeight(squat, [session(60, true)])).toBe(62.5);
  });

  it("holds the weight after one failed session", () => {
    expect(nextWorkingWeight(squat, [session(60, false)])).toBe(60);
  });

  it("holds the weight after two consecutive fails", () => {
    expect(
      nextWorkingWeight(squat, [session(60, false), session(60, false)]),
    ).toBe(60);
  });

  it("deloads 10% after three consecutive fails at the same weight", () => {
    expect(
      nextWorkingWeight(squat, [
        session(60, false),
        session(60, false),
        session(60, false),
      ]),
    ).toBe(52.5); // 54 rounded down to plate-loadable 2.5 step
  });

  it("a success between fails resets the fail count", () => {
    expect(
      nextWorkingWeight(squat, [
        session(60, false),
        session(60, true), // resets
        session(62.5, false),
        session(62.5, false),
      ]),
    ).toBe(62.5);
  });

  it("only counts fails at the current weight", () => {
    expect(
      nextWorkingWeight(squat, [
        session(57.5, false),
        session(60, false),
        session(60, false),
      ]),
    ).toBe(60);
  });

  it("assisted (negative) weight: success reduces the assistance", () => {
    // -15kg = machine takes 15kg off body weight; +2.5 → less help.
    expect(nextWorkingWeight(squat, [session(-15, true)])).toBe(-12.5);
  });

  it("assisted (negative) weight: deload adds assistance (gets easier)", () => {
    expect(
      nextWorkingWeight(squat, [
        session(-15, false),
        session(-15, false),
        session(-15, false),
      ]),
    ).toBe(-17.5); // -15 − 1.5 = -16.5, rounded down to the 2.5 step
  });

  it("uses per-exercise increments (deadlift +5kg)", () => {
    const deadlift = { ...squat, incrementKg: 5 };
    expect(nextWorkingWeight(deadlift, [session(120, true)])).toBe(125);
  });

  it("starts from the last session weight with an empty history edge", () => {
    expect(nextWorkingWeight(squat, [])).toBeUndefined();
  });
});

describe("roundToIncrement", () => {
  it("rounds down to the nearest 2.5", () => {
    expect(roundToIncrement(54, 2.5)).toBe(52.5);
    expect(roundToIncrement(55, 2.5)).toBe(55);
    expect(roundToIncrement(108, 2.5)).toBe(107.5);
  });
});

describe("editable progression params", () => {
  it("supports microload increments (+1.25 after a success)", () => {
    const micro = { ...squat, incrementKg: 1.25 };
    expect(nextWorkingWeight(micro, [session(60, true)])).toBe(61.25);
  });

  it("honours a custom deload percentage and fail trigger", () => {
    const rule = { ...squat, deloadPct: 0.05, deloadAfterFails: 2 };
    const history = [session(100, false), session(100, false)];
    expect(nextWorkingWeight(rule, history)).toBe(95); // −5% of 100
  });
});
