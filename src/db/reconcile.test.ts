import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "./db";
import { seedIfEmpty, reconcileUsers } from "./seed";
import { DEFAULT_USERS, type UserConfig } from "@/config/users";
import { startWorkout, logSet, finishWorkout } from "./session";

const REAL: UserConfig[] = [
  {
    id: "user-1",
    name: "Isaac",
    email: "lifter-one@example.com",
    accent: "blue",
    unit: "kg",
    template: "fiveByFive",
    workingWeights: { squatB: 27.5, deadlift: 120 },
  },
  {
    id: "user-2",
    name: "Sam",
    email: "lifter-two@example.com",
    accent: "green",
    unit: "kg",
    template: "routine",
  },
];

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("reconcileUsers (device seeded with stale config)", () => {
  it("updates placeholder identities in place, preserving ids and data", async () => {
    await seedIfEmpty(DEFAULT_USERS); // device got seeded by a placeholder build
    await reconcileUsers(REAL);
    const u1 = await db.users.get("user-1");
    expect(u1?.name).toBe("Isaac");
    expect(u1?.email).toBe("lifter-one@example.com");
    const u2 = await db.users.get("user-2");
    expect(u2?.name).toBe("Sam");
  });

  it("updates working weights when the user has no workouts yet", async () => {
    await seedIfEmpty(DEFAULT_USERS); // placeholder seed → default 20kg weights
    await reconcileUsers(REAL);
    const pes = await db.programExercises
      .where({ programDayId: "day-5x5-b-user-1" })
      .sortBy("position");
    expect(pes[0].workingWeightKg).toBe(27.5); // squat B from config
    expect(pes[2].workingWeightKg).toBe(120); // deadlift from config
  });

  it("never touches working weights once workouts exist", async () => {
    await seedIfEmpty(REAL);
    const day = await db.programDays.get("day-5x5-b-user-1");
    const s = await startWorkout("user-1", day!.id);
    const squat = s.exercises[0];
    await logSet(s.workout.id, "user-1", squat.exercise.id, 0, { weightKg: 27.5, reps: 5 });
    await finishWorkout(s.workout.id);

    await reconcileUsers([
      { ...REAL[0], workingWeights: { squatB: 100 } },
      REAL[1],
    ]);
    const pes = await db.programExercises
      .where({ programDayId: "day-5x5-b-user-1" })
      .sortBy("position");
    expect(pes[0].workingWeightKg).not.toBe(100);
  });

  it("seeds a config user that is missing entirely", async () => {
    await seedIfEmpty([REAL[0]]); // only user-1 on device
    await reconcileUsers(REAL);
    const u2 = await db.users.get("user-2");
    expect(u2?.name).toBe("Sam");
    const programs = await db.programs.where({ userId: "user-2" }).toArray();
    expect(programs).toHaveLength(1);
    expect(programs[0].mode).toBe("routine");
  });

  it("is a no-op when everything matches", async () => {
    await seedIfEmpty(REAL);
    const before = await db.users.toArray();
    await reconcileUsers(REAL);
    expect(await db.users.toArray()).toEqual(before);
  });
});

describe("accessory progression fix (pull-ups / dips / chin-ups → manual)", () => {
  const setInc = async (slug: string, inc: number) => {
    const exId = `ex-user-1-${slug}`;
    const pes = await db.programExercises.where("exerciseId").equals(exId).toArray();
    for (const pe of pes) await db.programExercises.update(pe.id, { incrementKg: inc });
  };
  const incOf = async (slug: string): Promise<number | undefined> => {
    const pe = (
      await db.programExercises.where("exerciseId").equals(`ex-user-1-${slug}`).toArray()
    )[0];
    return pe?.incrementKg;
  };

  it("seeds bodyweight accessories as manual out of the box", async () => {
    await seedIfEmpty(REAL);
    expect(await incOf("dips")).toBe(0);
    expect(await incOf("push-ups")).toBe(0);
    expect(await incOf("pullups")).toBe(0);
    expect(await incOf("chinups")).toBe(0);
  });

  it("flips accessories still at the +2.5 default to manual (0)", async () => {
    await seedIfEmpty(REAL);
    // Simulate a program seeded before the fix, when these auto-progressed.
    for (const s of ["dips", "pullups", "chinups"]) await setInc(s, 2.5);
    await reconcileUsers(REAL);
    expect(await incOf("dips")).toBe(0);
    expect(await incOf("pullups")).toBe(0);
    expect(await incOf("chinups")).toBe(0);
  });

  it("never overrides an increment the lifter chose themselves", async () => {
    await seedIfEmpty(REAL);
    await setInc("dips", 1.25);
    await reconcileUsers(REAL);
    expect(await incOf("dips")).toBe(1.25);
  });

  it("runs once — a later deliberate +2.5 is not re-zeroed", async () => {
    await seedIfEmpty(REAL);
    await setInc("dips", 2.5);
    await reconcileUsers(REAL); // migrates → 0 and drops the guard flag
    expect(await incOf("dips")).toBe(0);
    await setInc("dips", 2.5); // the lifter now WANTS auto-progression
    await reconcileUsers(REAL); // guard prevents undoing their choice
    expect(await incOf("dips")).toBe(2.5);
  });
});
