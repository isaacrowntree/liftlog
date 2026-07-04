import { describe, it, expect, beforeEach } from "vitest";
import { markJustFinished, takeJustFinished } from "./justFinished";

beforeEach(() => {
  sessionStorage.clear();
});

describe("justFinished handoff (workout screen → History congrats)", () => {
  it("returns null when nothing was marked", () => {
    expect(takeJustFinished()).toBeNull();
  });

  it("round-trips the finished workout id and tonnage", () => {
    markJustFinished({ workoutId: "w-1", tonnageKg: 1240 });
    expect(takeJustFinished()).toEqual({ workoutId: "w-1", tonnageKg: 1240 });
  });

  it("is one-shot: a second read is empty (no replay on refresh/revisit)", () => {
    markJustFinished({ workoutId: "w-1", tonnageKg: 500 });
    expect(takeJustFinished()).not.toBeNull();
    expect(takeJustFinished()).toBeNull();
  });

  it("ignores corrupt payloads instead of throwing", () => {
    sessionStorage.setItem("liftlog.justFinished", "{not json");
    expect(takeJustFinished()).toBeNull();
  });

  it("rejects a payload missing a workout id", () => {
    sessionStorage.setItem("liftlog.justFinished", JSON.stringify({ tonnageKg: 5 }));
    expect(takeJustFinished()).toBeNull();
  });
});
