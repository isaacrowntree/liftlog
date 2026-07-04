import { db } from "./db";
import type { Workout } from "@/lib/types";

/** localStorage key pinning the workout /workout resumes for this user. */
export function activeWorkoutKey(userId: string): string {
  return `liftlog.activeWorkout.${userId}`;
}

/** The workout /workout will resume: the locally-pinned id, if still open. */
export async function getActiveWorkout(userId: string): Promise<Workout | undefined> {
  if (typeof localStorage === "undefined") return undefined;
  const id = localStorage.getItem(activeWorkoutKey(userId));
  if (!id) return undefined;
  const w = await db.workouts.get(id);
  return w && w.endTs === undefined ? w : undefined;
}
