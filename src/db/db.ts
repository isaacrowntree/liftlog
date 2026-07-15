"use client";

/** Offline-first store: IndexedDB via Dexie is the source of truth on-device. */

import Dexie, { type EntityTable } from "dexie";
import type {
  User,
  Exercise,
  Program,
  ProgramDay,
  ProgramExercise,
  Workout,
  SetEntry,
} from "@/lib/types";

export interface Setting {
  key: string;
  value: unknown;
}

/** Sync op waiting to reach the journal (offline write-behind queue). */
export interface OutboxRow {
  id?: number;
  userId: string;
  opId: string;
  kind: string;
  payload: unknown;
}

/** A workout deleted somewhere. Remembered so a finishedWorkout op arriving
 * later — the normal cross-device ordering — can't walk it back in. */
export interface Tombstone {
  workoutId: string;
  userId: string;
  deletedAt: number;
}

export class LiftLogDB extends Dexie {
  users!: EntityTable<User, "id">;
  exercises!: EntityTable<Exercise, "id">;
  programs!: EntityTable<Program, "id">;
  programDays!: EntityTable<ProgramDay, "id">;
  programExercises!: EntityTable<ProgramExercise, "id">;
  workouts!: EntityTable<Workout, "id">;
  sets!: EntityTable<SetEntry, "id">;
  settings!: EntityTable<Setting, "key">;
  outbox!: EntityTable<OutboxRow, "id">;
  tombstones!: EntityTable<Tombstone, "workoutId">;

  constructor(name = "liftlog") {
    super(name);
    this.version(1).stores({
      users: "id, email",
      exercises: "id, userId, name",
      programs: "id, userId",
      programDays: "id, programId, position",
      programExercises: "id, programDayId, exerciseId, position",
      workouts: "id, userId, date, [userId+date]",
      sets: "id, workoutId, userId, exerciseId, [userId+exerciseId], completedTs",
      settings: "key",
    });
    // v2: index workouts by program day so progression history can be scoped
    // to the day the exercise belongs to.
    this.version(2).stores({
      workouts: "id, userId, date, programDayId, [userId+date]",
    });
    // v3: outbox — offline queue of sync ops headed for the journal.
    this.version(3).stores({
      outbox: "++id, userId, opId",
    });
    // v4: tombstones — the journal is append-only, so a delete has to be a
    // fact we remember, not an absence.
    this.version(4).stores({
      tombstones: "workoutId, userId",
    });
  }
}

export const db = new LiftLogDB();

/** ULID-ish sortable client id (offline-safe, no coordination needed). */
export function newId(): string {
  const t = Date.now().toString(36).padStart(9, "0");
  const r = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => (b % 36).toString(36))
    .join("");
  return `${t}${r}`;
}
