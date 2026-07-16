import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "./db";
import { seedIfEmpty } from "./seed";
import { setAccessIdentity } from "@/lib/identityGate";
import { startWorkout, logSet, finishWorkout } from "./session";
import {
  buildFinishedWorkoutOp,
  enqueueFinishedWorkout,
  flushOutbox,
  pullAndApply,
  applyOp,
  syncCursorKey,
  syncEpochKey,
  deleteWorkoutOpId,
} from "./sync";

const USER1 = "user-1";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfEmpty();
  localStorage.clear();
  setAccessIdentity(null); // unresolved identity — the permissive default
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function finishRealWorkout(): Promise<string> {
  const day = await db.programDays.get("day-5x5-b-user-1");
  const s = await startWorkout(USER1, day!.id);
  const squat = s.exercises.find((e) => e.exercise.name === "Squat")!;
  for (let i = 0; i < 5; i++) {
    await logSet(s.workout.id, USER1, squat.exercise.id, i, { weightKg: 27.5, reps: 5 });
  }
  await finishWorkout(s.workout.id);
  return s.workout.id;
}

describe("buildFinishedWorkoutOp", () => {
  it("bundles the workout, its sets, and current working weights", async () => {
    const workoutId = await finishRealWorkout();
    const op = await buildFinishedWorkoutOp(workoutId);
    expect(op?.opId).toBe(workoutId);
    expect(op?.kind).toBe("finishedWorkout");
    const p = op!.payload;
    expect(p.workout.id).toBe(workoutId);
    expect(p.sets).toHaveLength(5);
    expect(p.weights.length).toBeGreaterThan(0);
  });

  it("returns null for unfinished or missing workouts", async () => {
    const day = await db.programDays.get("day-5x5-a-user-1");
    const s = await startWorkout(USER1, day!.id);
    expect(await buildFinishedWorkoutOp(s.workout.id)).toBeNull();
    expect(await buildFinishedWorkoutOp("nope")).toBeNull();
  });
});

describe("outbox flush", () => {
  it("sends queued ops and drains the outbox on success", async () => {
    const workoutId = await finishRealWorkout();
    await enqueueFinishedWorkout(USER1, workoutId);
    expect(await db.outbox.count()).toBe(1);

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ seq: 1, accepted: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await flushOutbox(USER1, "lifter-one@example.com");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await db.outbox.count()).toBe(0);
  });

  it("keeps ops queued when offline", async () => {
    const workoutId = await finishRealWorkout();
    await enqueueFinishedWorkout(USER1, workoutId);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    await flushOutbox(USER1, "lifter-one@example.com");
    expect(await db.outbox.count()).toBe(1);
  });

  // An expired Cloudflare Access session redirects to a same-origin login
  // page, which fetch follows and reports as a 200 — so `res.ok` is true
  // while the journal never saw the ops. Draining here destroys the only
  // copy of an unsynced workout.
  it("keeps ops queued when Access answers with its 200 login page", async () => {
    const workoutId = await finishRealWorkout();
    await enqueueFinishedWorkout(USER1, workoutId);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<!DOCTYPE html><title>Sign in</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await flushOutbox(USER1, "lifter-one@example.com");
    expect(await db.outbox.count()).toBe(1);
  });
});

describe("pull and apply", () => {
  it("applies a finished-workout op from another device", async () => {
    // Device A produces the op
    const workoutId = await finishRealWorkout();
    const op = await buildFinishedWorkoutOp(workoutId);

    // Device B: fresh db
    await db.delete();
    await db.open();
    await seedIfEmpty();

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ops: [{ ...op, seq: 1 }], seq: 1 }), { status: 200 }),
    ));
    const { applied } = await pullAndApply(USER1, "lifter-one@example.com");
    expect(applied).toBe(1);
    expect(await db.workouts.get(workoutId)).toBeDefined();
    expect(await db.sets.where({ workoutId }).count()).toBe(5);
    // progression state came along (squat B advanced to 30)
    const pes = await db.programExercises
      .where({ programDayId: "day-5x5-b-user-1" })
      .sortBy("position");
    expect(pes[0].workingWeightKg).toBe(30);
    // cursor advanced
    expect(localStorage.getItem(syncCursorKey(USER1))).toBe("1");
  });

  // One malformed op must not take the whole journal down with it. The apply
  // loop and the cursor write share a try/catch, so a single throwing op
  // leaves the cursor unmoved — every later sync refetches from the same
  // place, hits the same op, and throws again. Sync is wedged forever, and
  // silently, because pullAndApply reports 0 either way.
  it("steps over a malformed op instead of wedging the cursor", async () => {
    const workoutId = await finishRealWorkout();
    const op = await buildFinishedWorkoutOp(workoutId);

    await db.delete();
    await db.open();
    await seedIfEmpty();

    const poison = {
      opId: "corrupt",
      kind: "finishedWorkout",
      payload: { workout: { id: "bad", userId: USER1 }, sets: null, weights: [], exercises: [] },
    };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(
        JSON.stringify({ ops: [{ ...poison, seq: 1 }, { ...op, seq: 2 }], seq: 2 }),
        { status: 200 },
      ),
    ));

    const { applied } = await pullAndApply(USER1, "lifter-one@example.com");

    // The healthy op behind the poison one still landed...
    expect(applied).toBe(1);
    expect(await db.workouts.get(workoutId)).toBeDefined();
    // ...and the cursor moved on, so the next sync makes progress.
    expect(localStorage.getItem(syncCursorKey(USER1))).toBe("2");
  });

  it("re-applying the same op is a no-op", async () => {
    const workoutId = await finishRealWorkout();
    const op = await buildFinishedWorkoutOp(workoutId);
    const before = await db.sets.count();
    await applyOp(USER1, op!);
    expect(await db.sets.count()).toBe(before);
  });

  it("pulls only ops after the stored cursor", async () => {
    localStorage.setItem(syncCursorKey(USER1), "7");
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      new Response(JSON.stringify({ ops: [], seq: 7 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await pullAndApply(USER1, "lifter-one@example.com");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("since=7");
  });
});

/** A cursor only means something against the journal generation that issued
 * it. After a journal reset the rebuilt log restarts at seq 1, so a device
 * still holding cursor 4 asks for `seq > 4` and is told "nothing" — forever.
 * The epoch is how it notices and replays. */
describe("journal epoch", () => {
  it("replays from zero when the journal reports a new epoch", async () => {
    const workoutId = await finishRealWorkout();
    const op = await buildFinishedWorkoutOp(workoutId);

    // Device B: has synced before, cursor is way past the rebuilt journal.
    await db.delete();
    await db.open();
    await seedIfEmpty();
    localStorage.setItem(syncCursorKey(USER1), "4");
    localStorage.setItem(syncEpochKey(USER1), "old-generation");

    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      seen.push(url);
      const since = Number(new URL(url, "http://x").searchParams.get("since"));
      const ops = since < 1 ? [{ ...op, seq: 1 }] : [];
      return new Response(JSON.stringify({ ops, seq: 1, epoch: "new-generation" }), { status: 200 });
    }));

    const { applied } = await pullAndApply(USER1, "lifter-one@example.com");

    // It re-asked from 0 rather than trusting the stale cursor...
    expect(seen.some((u) => u.includes("since=4"))).toBe(true);
    expect(seen.some((u) => u.includes("since=0"))).toBe(true);
    // ...and the op the stale cursor would have hidden was applied.
    expect(applied).toBe(1);
    expect(await db.workouts.get(workoutId)).toBeDefined();
    expect(localStorage.getItem(syncEpochKey(USER1))).toBe("new-generation");
  });

  it("does not replay when the epoch is unchanged", async () => {
    localStorage.setItem(syncCursorKey(USER1), "7");
    localStorage.setItem(syncEpochKey(USER1), "same");
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      new Response(JSON.stringify({ ops: [], seq: 7, epoch: "same" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await pullAndApply(USER1, "lifter-one@example.com");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("since=7");
  });
});

/** The journal is append-only, so a workout that should never have been
 * recorded (e.g. one logged purely to advance the program) can only be undone
 * by a further op. Deleting it must also roll back the working weight it
 * advanced — otherwise the history says one thing and the program another. */
describe("deleteWorkout op", () => {
  it("removes the workout, its sets, and rolls back the weight it advanced", async () => {
    const workoutId = await finishRealWorkout();
    expect(await db.sets.where({ workoutId }).count()).toBe(5);
    const pe = (await db.programExercises.where({ programDayId: "day-5x5-b-user-1" }).sortBy("position"))[0];
    expect(pe.workingWeightKg).toBe(30); // advanced by the workout

    const applied = await applyOp(USER1, {
      opId: `del:${workoutId}`,
      kind: "deleteWorkout",
      payload: { workoutId, weights: [{ programExerciseId: pe.id, workingWeightKg: 27.5 }] },
    } as never);

    expect(applied).toBe(true);
    expect(await db.workouts.get(workoutId)).toBeUndefined();
    expect(await db.sets.where({ workoutId }).count()).toBe(0);
    expect((await db.programExercises.get(pe.id))?.workingWeightKg).toBe(27.5);
  });

  // Delete-before-create is the normal ordering across devices: a device that
  // does not hold the workout yet must still remember the deletion, or the
  // workout walks back in the moment its finishedWorkout op arrives.
  it("records the tombstone even when the workout isn't here yet", async () => {
    const workoutId = await finishRealWorkout();
    const op = await buildFinishedWorkoutOp(workoutId);

    await db.delete();
    await db.open();
    await seedIfEmpty();

    // Delete arrives first, for a workout this device has never seen.
    const deleted = await applyOp(USER1, {
      opId: `del:${workoutId}`,
      kind: "deleteWorkout",
      payload: { workoutId },
    } as never);
    expect(deleted).toBe(true);

    // The create arrives afterwards and must NOT resurrect it.
    const recreated = await applyOp(USER1, op!);
    expect(recreated).toBe(false);
    expect(await db.workouts.get(workoutId)).toBeUndefined();
  });

  it("is idempotent — replaying the delete is harmless", async () => {
    const workoutId = await finishRealWorkout();
    const op = { opId: `del:${workoutId}`, kind: "deleteWorkout", payload: { workoutId } } as never;
    await applyOp(USER1, op);
    await expect(applyOp(USER1, op)).resolves.not.toThrow();
    expect(await db.workouts.get(workoutId)).toBeUndefined();
  });
});

/** Linked progression writes a lift's new weight to its slots on OTHER program
 * days too (squat is one ladder across A/B). The op has to carry what the
 * finish actually wrote, or the peer advances only the day it can see and the
 * two devices quietly disagree about the other one — which is the whole bug
 * class this journal exists to prevent. */
describe("linked progression crosses devices", () => {
  it("the peer ends up with the same weights as the author, on BOTH days", async () => {
    const sq = async (day: string) =>
      ((await db.programExercises.where({ programDayId: day }).sortBy("position"))[0])!
        .workingWeightKg;

    // Author finishes Workout B; linking advances squat on A and B.
    const s = await startWorkout(USER1, "day-5x5-b-user-1");
    const squat = s.exercises.find((e) => e.exercise.name === "Squat")!;
    const at = squat.targets[0]!.weightKg!;
    for (let i = 0; i < 5; i++) {
      await logSet(s.workout.id, USER1, squat.exercise.id, i, { weightKg: at, reps: 5 });
    }
    await finishWorkout(s.workout.id);

    const authorA = await sq("day-5x5-a-user-1");
    const authorB = await sq("day-5x5-b-user-1");
    expect(authorA).toBe(authorB); // linked, on the author

    const op = await buildFinishedWorkoutOp(s.workout.id);

    // Peer applies that op to a fresh device.
    await db.delete();
    await db.open();
    await seedIfEmpty();
    await applyOp(USER1, op!);

    expect(await sq("day-5x5-b-user-1")).toBe(authorB);
    expect(await sq("day-5x5-a-user-1")).toBe(authorA); // the sibling the op must carry
  });
});

/** The journal is addressed by the SERVER-side Access identity, but the ops
 * carry whichever avatar is selected here. finishFlow calls flushOutbox
 * directly — not through syncNow — so syncNow's gate doesn't cover it. Without
 * a gate of its own, finishing a workout as the other avatar posts it to the
 * signed-in identity's journal, gets a valid ack, and DRAINS the outbox: the
 * op is junk in an append-only log that will never serve it back, and the only
 * copy of the workout is gone. That is the incident this journal exists to
 * prevent, on the path that runs after every workout. */
describe("flushOutbox identity gate", () => {
  it("refuses to push an avatar that isn't the signed-in identity", async () => {
    const workoutId = await finishRealWorkout();
    await enqueueFinishedWorkout(USER1, workoutId);
    setAccessIdentity("someone-else@example.com");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ seq: 1, accepted: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await flushOutbox(USER1, "lifter-one@example.com");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(await db.outbox.count()).toBe(1); // the only copy survives
  });

  it("pushes normally when the avatar IS the signed-in identity", async () => {
    const workoutId = await finishRealWorkout();
    await enqueueFinishedWorkout(USER1, workoutId);
    setAccessIdentity("lifter-one@example.com");

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ seq: 1, accepted: 1 }), { status: 200 }),
    ));

    expect((await flushOutbox(USER1, "lifter-one@example.com")).ok).toBe(true);
    expect(await db.outbox.count()).toBe(0);
  });
});

/** A journal replay must land where the first pass landed.
 *
 * Replay is not exotic: autoRestoreIfEmpty restores from R2 and never sets the
 * cursor, so EVERY fresh device replays the whole journal from 0 onto a
 * snapshot that already reflects it. The epoch path replays by design too, and
 * has already run in production. */
describe("replaying the journal", () => {
  const peSquatA = async () =>
    ((await db.programExercises.where({ programDayId: "day-5x5-a-user-1" }).sortBy("position"))[0])!;

  const delOp = (peId: string, kg: number) =>
    ({
      opId: deleteWorkoutOpId("ghost"),
      kind: "deleteWorkout",
      payload: { workoutId: "ghost", weights: [{ programExerciseId: peId, workingWeightKg: kg }] },
    }) as never;

  const finishOp = (peId: string, kg: number) =>
    ({
      opId: "later-workout",
      kind: "finishedWorkout",
      payload: {
        workout: {
          id: "later-workout", userId: USER1, dayLabel: "Workout A", date: "2026-07-12",
          programDayId: "day-5x5-a-user-1", startTs: 1, endTs: 2,
        },
        sets: [], weights: [{ programExerciseId: peId, workingWeightKg: kg }], exercises: [],
      },
    }) as never;

  it("a delete then a finish converges on the finish's weight, and stays there", async () => {
    const pe = (await peSquatA()).id;

    await applyOp(USER1, delOp(pe, 25)); // rolls back
    await applyOp(USER1, finishOp(pe, 27.5)); // then corrects
    expect((await peSquatA()).workingWeightKg).toBe(27.5);

    // Replay the same two ops onto state that already reflects them.
    await applyOp(USER1, delOp(pe, 25));
    await applyOp(USER1, finishOp(pe, 27.5));
    expect((await peSquatA()).workingWeightKg).toBe(27.5);
  });

  /** GUARD. Working weight has writers that emit no op at all — the layoff
   * deload button, manual edits in /program, mid-workout edits. A replay must
   * not re-assert an op's stale snapshot over them. This passes today and is
   * exactly what "apply weights even when the workout exists" would break. */
  it("does not revert an un-journalled weight edit", async () => {
    const workoutId = await finishRealWorkout();
    const op = await buildFinishedWorkoutOp(workoutId);
    const pe = (await db.programExercises
      .where({ programDayId: "day-5x5-b-user-1" }).sortBy("position"))[0]!;

    // Hand edit, the way /program does it. No op exists for this.
    await db.programExercises.update(pe.id, { workingWeightKg: 42.5 });

    await applyOp(USER1, op!); // replay

    expect((await db.programExercises.get(pe.id))?.workingWeightKg).toBe(42.5);
  });

  /** GUARD. A tombstoned workout's finish op must not advance the weight —
   * the workout is gone, so the progression it claimed never happened. */
  it("does not advance the weight for a workout that was deleted", async () => {
    const pe = (await peSquatA()).id;
    const before = (await peSquatA()).workingWeightKg;

    await applyOp(USER1, {
      opId: deleteWorkoutOpId("later-workout"),
      kind: "deleteWorkout",
      payload: { workoutId: "later-workout" },
    } as never);
    await applyOp(USER1, finishOp(pe, 99));

    expect((await peSquatA()).workingWeightKg).toBe(before);
  });
});
