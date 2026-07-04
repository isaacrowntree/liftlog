import { describe, it, expect } from "vitest";
import {
  deloadPctForLayoff,
  applyLayoffDeload,
  deloadAckKey,
  layoffDeloadOffered,
} from "./deload";

describe("deloadPctForLayoff (graduated by time away)", () => {
  it("suggests nothing under two weeks away", () => {
    expect(deloadPctForLayoff(0)).toBe(0);
    expect(deloadPctForLayoff(7)).toBe(0);
    expect(deloadPctForLayoff(13)).toBe(0);
  });

  it("suggests 10% from two weeks", () => {
    expect(deloadPctForLayoff(14)).toBe(0.1);
    expect(deloadPctForLayoff(27)).toBe(0.1);
  });

  it("suggests 20% from four weeks", () => {
    expect(deloadPctForLayoff(28)).toBe(0.2);
    expect(deloadPctForLayoff(55)).toBe(0.2);
  });

  it("suggests 30% from eight weeks", () => {
    expect(deloadPctForLayoff(56)).toBe(0.3);
    expect(deloadPctForLayoff(365)).toBe(0.3);
  });
});

describe("applyLayoffDeload", () => {
  it("cuts by the percentage, rounded down to 2.5", () => {
    expect(applyLayoffDeload(100, 0.1)).toBe(90);
    expect(applyLayoffDeload(62.5, 0.1)).toBe(55);
    expect(applyLayoffDeload(120, 0.3)).toBe(82.5);
  });

  it("never raises a weight (no 20kg floor bug)", () => {
    expect(applyLayoffDeload(2.5, 0.1)).toBe(2.5);
    expect(applyLayoffDeload(10, 0.2)).toBe(10);
  });

  it("never drops below the empty bar for barbell-range weights", () => {
    expect(applyLayoffDeload(22.5, 0.3)).toBe(20);
  });

  it("leaves assisted (negative) and bodyweight (zero) values alone", () => {
    expect(applyLayoffDeload(-2.5, 0.2)).toBe(-2.5);
    expect(applyLayoffDeload(0, 0.2)).toBe(0);
  });
});

describe("deloadAckKey", () => {
  it("namespaces the ack per user", () => {
    expect(deloadAckKey("user-1")).toBe("liftlog.layoffDeload.user-1");
    expect(deloadAckKey("user-2")).not.toBe(deloadAckKey("user-1"));
  });
});

describe("layoffDeloadOffered (show once per qualifying layoff)", () => {
  const lastEndTs = 1_000_000;

  it("is hidden with no workout history", () => {
    expect(
      layoffDeloadOffered({ daysSince: null, ackTs: 0, lastEndTs: 0 }),
    ).toBe(false);
  });

  it("is hidden when the layoff is too short to warrant a cut", () => {
    expect(layoffDeloadOffered({ daysSince: 10, ackTs: 0, lastEndTs })).toBe(
      false,
    );
  });

  it("shows for a qualifying layoff that hasn't been acknowledged", () => {
    expect(layoffDeloadOffered({ daysSince: 21, ackTs: 0, lastEndTs })).toBe(
      true,
    );
  });

  it("hides once acknowledged after the last workout", () => {
    expect(
      layoffDeloadOffered({ daysSince: 21, ackTs: lastEndTs + 1, lastEndTs }),
    ).toBe(false);
  });

  it("reappears when a newer workout post-dates the old acknowledgement", () => {
    // Took a deload, trained, then laid off again: newer lastEndTs > old ack.
    expect(
      layoffDeloadOffered({ daysSince: 30, ackTs: lastEndTs, lastEndTs: lastEndTs + 5 }),
    ).toBe(true);
  });
});
