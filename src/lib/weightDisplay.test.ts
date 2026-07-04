import { describe, it, expect } from "vitest";
import { roundStep, fmtWeight } from "./weightDisplay";

describe("roundStep", () => {
  it("passes clean 2.5kg steps through unchanged", () => {
    expect(roundStep(2.5)).toBe(2.5);
    expect(roundStep(-2.5)).toBe(-2.5);
    expect(roundStep(42.5)).toBe(42.5);
  });

  it("scrubs binary floating-point drift", () => {
    // 0.1 + 0.2 style accumulation shouldn't leak into the weight.
    expect(roundStep(0.1 + 0.2)).toBe(0.3);
    expect(roundStep(-2.5 + 2.5)).toBe(0);
  });

  it("normalises negative zero to positive zero", () => {
    expect(Object.is(roundStep(-0), 0)).toBe(true);
  });
});

describe("fmtWeight", () => {
  it("labels positive and zero weights plainly", () => {
    expect(fmtWeight(0)).toBe("0kg");
    expect(fmtWeight(20)).toBe("20kg");
    expect(fmtWeight(2.5)).toBe("2.5kg");
  });

  it("uses a real minus glyph (U+2212) for assisted weights", () => {
    expect(fmtWeight(-2.5)).toBe("−2.5kg");
    expect(fmtWeight(-15)).toBe("−15kg");
  });
});
