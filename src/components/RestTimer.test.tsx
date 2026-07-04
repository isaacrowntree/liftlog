import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRestTimer } from "./RestTimer";

/** SL-style rest timer: counts UP from the logged set. The suggestion
 * (1:30 / 5:00) is a marker it rings at — the clock keeps running until the
 * next set, the end of the workout, or a manual dismiss. */
describe("useRestTimer (count-up stopwatch)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts up from zero when a set is logged", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(90));
    expect(result.current.elapsed).toBe(0);
    expect(result.current.suggestion).toBe(90);
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.elapsed).toBe(30);
    expect(result.current.running).toBe(true);
  });

  it("climbs the SL ladder past the suggestion: 1:30 → 3:00 → 5:00", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(90));
    act(() => vi.advanceTimersByTime(89_000));
    expect(result.current.suggestion).toBe(90);
    expect(result.current.overdue).toBe(false);
    // Past 1:30 — bell rings, next marker becomes 3:00, not overdue yet.
    act(() => vi.advanceTimersByTime(31_000));
    expect(result.current.running).toBe(true); // still on screen
    expect(result.current.suggestion).toBe(180);
    expect(result.current.overdue).toBe(false);
    expect(result.current.elapsed).toBe(120);
    // Past 3:00 — final marker becomes 5:00.
    act(() => vi.advanceTimersByTime(70_000));
    expect(result.current.suggestion).toBe(300);
    expect(result.current.overdue).toBe(false);
    // Past 5:00 — end of the ladder: overdue.
    act(() => vi.advanceTimersByTime(120_000));
    expect(result.current.overdue).toBe(true);
    expect(result.current.running).toBe(true);
  });

  it("a 5:00 suggestion (failed set) has no further ladder — overdue at 5:00", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(300));
    act(() => vi.advanceTimersByTime(301_000));
    expect(result.current.overdue).toBe(true);
    expect(result.current.suggestion).toBe(300);
  });

  it("resume after refresh fast-forwards the ladder without re-ringing", () => {
    const first = renderHook(() => useRestTimer());
    act(() => first.result.current.start(90));
    act(() => vi.advanceTimersByTime(40_000));
    first.unmount();

    act(() => vi.setSystemTime(Date.now() + 160_000)); // now ~200s elapsed
    const second = renderHook(() => useRestTimer());
    expect(second.result.current.running).toBe(true);
    expect(second.result.current.suggestion).toBe(300);
    expect(second.result.current.overdue).toBe(false);
  });

  it("stays wall-clock correct when ticks are suspended (backgrounded)", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(90));
    act(() => {
      vi.setSystemTime(Date.now() + 60_000);
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.elapsed).toBeGreaterThanOrEqual(60);
  });

  it("logging the next set restarts the clock from zero", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(90));
    act(() => vi.advanceTimersByTime(140_000));
    act(() => result.current.start(300)); // failed set → 5:00 suggestion
    expect(result.current.elapsed).toBe(0);
    expect(result.current.suggestion).toBe(300);
    expect(result.current.overdue).toBe(false);
  });

  it("dismiss stops the clock entirely", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(90));
    act(() => vi.advanceTimersByTime(10_000));
    act(() => result.current.stop());
    expect(result.current.running).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.running).toBe(false);
  });

  it("survives unmount and resumes with correct elapsed time (refresh)", () => {
    const first = renderHook(() => useRestTimer());
    act(() => first.result.current.start(90));
    act(() => vi.advanceTimersByTime(40_000));
    first.unmount();

    const second = renderHook(() => useRestTimer());
    expect(second.result.current.running).toBe(true);
    expect(second.result.current.elapsed).toBeGreaterThanOrEqual(40);
    expect(second.result.current.suggestion).toBe(90);
  });

  it("countdown style (Strong/routine): rings at zero then auto-dismisses", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(120, "down"));
    expect(result.current.style).toBe("down");
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.remaining).toBe(90);
    expect(result.current.running).toBe(true);
    act(() => vi.advanceTimersByTime(90_000));
    expect(result.current.overdue).toBe(true); // GO moment
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current.running).toBe(false); // auto-dismissed, Strong-style
  });

  it("countdown survives refresh with correct remaining", () => {
    const first = renderHook(() => useRestTimer());
    act(() => first.result.current.start(120, "down"));
    act(() => vi.advanceTimersByTime(40_000));
    first.unmount();
    const second = renderHook(() => useRestTimer());
    expect(second.result.current.running).toBe(true);
    expect(second.result.current.style).toBe("down");
    expect(second.result.current.remaining).toBeLessThanOrEqual(80);
  });

  it("does not resurrect a rest dismissed before unmount", () => {
    const first = renderHook(() => useRestTimer());
    act(() => first.result.current.start(90));
    act(() => first.result.current.stop());
    first.unmount();
    const second = renderHook(() => useRestTimer());
    expect(second.result.current.running).toBe(false);
  });
});
