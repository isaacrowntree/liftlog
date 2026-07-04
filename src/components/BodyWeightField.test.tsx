import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { db, newId } from "@/db/db";
import { BodyWeightField } from "./BodyWeightField";

// Carry-forward itself is startWorkout's job (tested in src/db/fixes.test.ts);
// this component just binds the workout's stored value.

async function makeWorkout(bodyWeightKg?: number): Promise<string> {
  const id = newId();
  await db.workouts.add({
    id,
    userId: "user-1",
    dayLabel: "Workout A",
    date: "2026-07-01",
    startTs: Date.now(),
    bodyWeightKg,
  });
  return id;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("BodyWeightField", () => {
  it("shows the workout's stored body weight (e.g. carried forward)", async () => {
    const current = await makeWorkout(97.75);
    render(<BodyWeightField workoutId={current} />);
    await waitFor(() => {
      expect(screen.getByLabelText(/body weight/i)).toHaveValue(97.75);
    });
  });

  it("stays empty when the workout has no body weight", async () => {
    const current = await makeWorkout(undefined);
    render(<BodyWeightField workoutId={current} />);
    await waitFor(() => {
      expect(screen.getByLabelText(/body weight/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/body weight/i)).toHaveValue(null);
  });
});
