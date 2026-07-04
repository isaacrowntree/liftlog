/** Per-session metric series for the Progress detail screen. Pure.
 *
 * One point per workout, oldest → newest, over work sets only (warmups don't
 * count toward a lift's numbers). Every metric is computed so the UI can pick
 * whichever suit the exercise kind. */

import { epley } from "./e1rm";
import type { RecordSet } from "./records";

export interface SessionMetrics {
  workoutId: string;
  ts: number;
  /** Heaviest work set (assistance/negative counts as 0). */
  weightTop: number;
  /** Best estimated 1RM across the work sets. */
  e1rm: number;
  /** Σ max(0, weight) × reps — total weight moved. */
  volume: number;
  /** Σ reps across work sets. */
  repsTotal: number;
  /** Most reps in a single work set. */
  repsTop: number;
  /** Σ seconds across timed work sets. */
  secondsTotal: number;
  /** Longest single hold. */
  secondsTop: number;
}

export function sessionSeries(sets: RecordSet[]): SessionMetrics[] {
  const byWorkout = new Map<string, RecordSet[]>();
  for (const s of sets) {
    if (s.isWarmup) continue;
    const arr = byWorkout.get(s.workoutId) ?? [];
    arr.push(s);
    byWorkout.set(s.workoutId, arr);
  }

  const out: SessionMetrics[] = [];
  for (const [workoutId, ss] of byWorkout) {
    out.push({
      workoutId,
      ts: Math.max(...ss.map((s) => s.completedTs ?? 0)),
      weightTop: Math.max(0, ...ss.map((s) => s.weightKg ?? 0)),
      e1rm: Math.max(0, ...ss.map((s) => epley(s.weightKg ?? 0, s.reps ?? 0))),
      volume: ss.reduce((v, s) => v + Math.max(0, s.weightKg ?? 0) * (s.reps ?? 0), 0),
      repsTotal: ss.reduce((r, s) => r + (s.reps ?? 0), 0),
      repsTop: Math.max(0, ...ss.map((s) => s.reps ?? 0)),
      secondsTotal: ss.reduce((sec, s) => sec + (s.seconds ?? 0), 0),
      secondsTop: Math.max(0, ...ss.map((s) => s.seconds ?? 0)),
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}
