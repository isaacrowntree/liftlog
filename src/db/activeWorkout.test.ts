import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db, newId } from "./db";
import { getActiveWorkout, activeWorkoutKey } from "./activeWorkout";

const USER = "user-1";

async function makeWorkout(opts: { endTs?: number }): Promise<string> {
  const id = newId();
  await db.workouts.add({
    id,
    userId: USER,
    programDayId: "day-a",
    dayLabel: "Workout A",
    date: "2026-07-01",
    startTs: Date.now(),
    endTs: opts.endTs,
  });
  return id;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

describe("getActiveWorkout", () => {
  it("returns undefined when nothing is pinned", async () => {
    expect(await getActiveWorkout(USER)).toBeUndefined();
  });

  it("returns the pinned workout while it is still open", async () => {
    const id = await makeWorkout({});
    localStorage.setItem(activeWorkoutKey(USER), id);
    const active = await getActiveWorkout(USER);
    expect(active?.id).toBe(id);
  });

  it("returns undefined once the pinned workout is finished", async () => {
    const id = await makeWorkout({ endTs: Date.now() });
    localStorage.setItem(activeWorkoutKey(USER), id);
    expect(await getActiveWorkout(USER)).toBeUndefined();
  });

  it("returns undefined when the pointer is stale (workout deleted)", async () => {
    localStorage.setItem(activeWorkoutKey(USER), "gone");
    expect(await getActiveWorkout(USER)).toBeUndefined();
  });

  it("is scoped per user", async () => {
    const id = await makeWorkout({});
    localStorage.setItem(activeWorkoutKey(USER), id);
    expect(await getActiveWorkout("user-2")).toBeUndefined();
  });
});
