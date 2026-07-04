import { describe, it, expect } from "vitest";
import { summarizeTrend, deltaLabel } from "./progressTrend";

describe("summarizeTrend", () => {
  it("has no history for a single session", () => {
    const t = summarizeTrend([100]);
    expect(t.hasHistory).toBe(false);
    expect(t.meaningful).toBe(false);
    expect(t.delta).toBe(0);
  });

  it("is not meaningful when every session is identical (flat rep line)", () => {
    const t = summarizeTrend([10, 10, 10, 10]);
    expect(t.hasHistory).toBe(true);
    expect(t.meaningful).toBe(false);
    expect(t.delta).toBe(0);
  });

  it("is meaningful when the value moves, with a signed delta", () => {
    const t = summarizeTrend([60, 62.5, 65, 67.5]);
    expect(t.meaningful).toBe(true);
    expect(t.first).toBe(60);
    expect(t.last).toBe(67.5);
    expect(t.delta).toBe(7.5);
    expect(t.min).toBe(60);
    expect(t.max).toBe(67.5);
  });

  it("reports a downward trend as a negative delta", () => {
    expect(summarizeTrend([100, 95, 90]).delta).toBe(-10);
  });

  it("handles an empty series without throwing", () => {
    const t = summarizeTrend([]);
    expect(t).toMatchObject({ meaningful: false, hasHistory: false, delta: 0 });
  });
});

describe("deltaLabel", () => {
  it("formats a gain with a plus and unit", () => {
    expect(deltaLabel(summarizeTrend([60, 67.5]), "kg")).toBe("+7.5kg");
  });

  it("formats a loss with a real minus sign", () => {
    expect(deltaLabel(summarizeTrend([100, 90]), "kg")).toBe("−10kg");
  });

  it("is empty for a flat or single-session series", () => {
    expect(deltaLabel(summarizeTrend([10, 10]))).toBe("");
    expect(deltaLabel(summarizeTrend([10]))).toBe("");
  });
});
