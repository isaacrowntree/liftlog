"use client";

/** Device↔cloud sync over the per-user Durable Object journal.
 * Unit of sync: one FINISHED workout (workout row + its sets + the working
 * weights it produced). Ops are idempotent — opId is the workout id — and
 * queue in an outbox while offline. */

import { db } from "./db";
import type { Exercise, SetEntry, Workout } from "@/lib/types";

export interface FinishedWorkoutPayload {
  workout: Workout;
  sets: SetEntry[];
  weights: Array<{ programExerciseId: string; workingWeightKg: number }>;
  /** Exercises the sets reference — upserted on apply so ops from a device
   * with imported/custom exercises resolve everywhere. */
  exercises: Exercise[];
}

export interface SyncOp {
  opId: string;
  kind: "finishedWorkout";
  payload: FinishedWorkoutPayload;
}

export function syncCursorKey(userId: string): string {
  return `liftlog.syncCursor.${userId}`;
}

function devHeaders(email: string): HeadersInit {
  return process.env.NODE_ENV === "development"
    ? { "x-liftlog-dev-user": email }
    : {};
}

/** Snapshot a finished workout into a sync op. Null for unfinished/missing. */
export async function buildFinishedWorkoutOp(workoutId: string): Promise<SyncOp | null> {
  const workout = await db.workouts.get(workoutId);
  if (!workout || workout.endTs === undefined) return null;
  const sets = await db.sets.where({ workoutId }).toArray();

  const weights: FinishedWorkoutPayload["weights"] = [];
  if (workout.programDayId) {
    const pes = await db.programExercises
      .where({ programDayId: workout.programDayId })
      .toArray();
    for (const pe of pes) {
      if (pe.workingWeightKg !== undefined) {
        weights.push({ programExerciseId: pe.id, workingWeightKg: pe.workingWeightKg });
      }
    }
  }
  const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
  const exercises = (await db.exercises.bulkGet(exerciseIds)).filter(
    (e): e is Exercise => e !== undefined,
  );

  return {
    opId: workout.id,
    kind: "finishedWorkout",
    payload: { workout, sets, weights, exercises },
  };
}

export async function enqueueFinishedWorkout(
  userId: string,
  workoutId: string,
): Promise<void> {
  const op = await buildFinishedWorkoutOp(workoutId);
  if (!op) return;
  const existing = await db.outbox.where({ opId: op.opId }).count();
  if (existing > 0) return;
  await db.outbox.add({ userId, opId: op.opId, kind: op.kind, payload: op.payload });
}

/** Push everything queued for this user. Failures keep the queue intact. */
export async function flushOutbox(userId: string, email: string): Promise<void> {
  const rows = await db.outbox.where({ userId }).toArray();
  if (rows.length === 0) return;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json", ...devHeaders(email) },
      body: JSON.stringify({
        ops: rows.map((r) => ({ opId: r.opId, kind: r.kind, payload: r.payload })),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    await db.outbox.bulkDelete(rows.map((r) => r.id!));
  } catch {
    // offline — the outbox flushes next time
  }
}

/** Apply one journal op to this device. Existing workouts are never touched. */
export async function applyOp(userId: string, op: SyncOp): Promise<boolean> {
  if (op.kind !== "finishedWorkout") return false;
  const { workout, sets, weights } = op.payload;
  if (workout.userId !== userId) return false;
  if (await db.workouts.get(workout.id)) return false;

  const { exercises } = op.payload;
  await db.transaction(
    "rw",
    [db.workouts, db.sets, db.programExercises, db.exercises],
    async () => {
      for (const ex of exercises ?? []) {
        if (!(await db.exercises.get(ex.id))) await db.exercises.put(ex);
      }
      await db.workouts.put(workout);
      if (sets.length) await db.sets.bulkPut(sets);
      for (const w of weights) {
        const pe = await db.programExercises.get(w.programExerciseId);
        if (pe) await db.programExercises.update(pe.id, { workingWeightKg: w.workingWeightKg });
      }
    },
  );
  return true;
}

/** Pull ops after our cursor and apply them. Returns how many applied. */
export async function pullAndApply(userId: string, email: string): Promise<number> {
  const since = Number(localStorage.getItem(syncCursorKey(userId)) ?? 0) || 0;
  try {
    const res = await fetch(`/api/sync?since=${since}`, {
      headers: devHeaders(email),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { ops: Array<SyncOp & { seq: number }>; seq: number };
    let applied = 0;
    for (const op of body.ops ?? []) {
      if (await applyOp(userId, op)) applied++;
    }
    localStorage.setItem(syncCursorKey(userId), String(body.seq ?? since));
    return applied;
  } catch {
    return 0;
  }
}
