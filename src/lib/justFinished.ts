/** One-shot handoff from the workout screen to History: "you just finished
 * this — celebrate it once." sessionStorage so a refresh doesn't re-toast. */

const KEY = "liftlog.justFinished";

export interface JustFinished {
  workoutId: string;
  /** Total weight moved this session: Σ weight × reps, warmups included. */
  tonnageKg: number;
}

export function markJustFinished(data: JustFinished): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full/blocked — losing the congrats banner is fine.
  }
}

/** Read-and-clear: the celebration shows exactly once. */
export function takeJustFinished(): JustFinished | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as JustFinished;
    return typeof parsed?.workoutId === "string" ? parsed : null;
  } catch {
    return null;
  }
}
