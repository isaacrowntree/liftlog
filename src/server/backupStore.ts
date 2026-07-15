/** R2-backed backup snapshots, one namespace per Access identity.
 * Pure functions over a minimal bucket interface so the logic is testable
 * without a Workers runtime. */

export interface PutOptions {
  /** R2 conditional write: refuse (return null) if the object moved on. */
  onlyIf?: { etagMatches?: string };
}

export interface BackupBucket {
  put(key: string, value: string, options?: PutOptions): Promise<unknown | null>;
  get(key: string): Promise<{ text(): Promise<string>; etag?: string } | null>;
}

interface Row {
  id: string;
  [k: string]: unknown;
}
interface SetRow extends Row {
  workoutId?: string;
}

export interface BackupData {
  format?: string;
  version?: number;
  exportedAt?: string;
  userId?: string;
  exercises?: Row[];
  programs?: Row[];
  programDays?: Row[];
  programExercises?: Row[];
  workouts?: Row[];
  sets?: SetRow[];
}

function unionById<T extends Row>(existing: T[], incoming: T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of existing) byId.set(r.id, r);
  for (const r of incoming) byId.set(r.id, r); // incoming is the fresher edit
  return [...byId.values()];
}

/** Combine what's published with what a device is publishing.
 *
 * `latest.json` is the SHARED view, but each device uploads its own whole
 * database. A blind write therefore lets a device that hasn't pulled yet
 * publish a history in which the workouts it never saw simply never happened
 * — which is how a real workout was erased from this bucket. Union instead:
 * a device can add to the shared view, never subtract from it.
 *
 * Deletion then needs an explicit authority, because union alone can't drop a
 * row: that's `tombstonedWorkoutIds`, taken from the journal's deleteWorkout
 * ops. Program structure stays last-writer-wins — it isn't journalled, so
 * unioning it would resurrect exercises the user removed from their program. */
export function mergeBackups(
  existing: BackupData | null,
  incoming: BackupData,
  tombstonedWorkoutIds: string[],
): BackupData {
  const dead = new Set(tombstonedWorkoutIds);

  const workouts = unionById(existing?.workouts ?? [], incoming.workouts ?? []).filter(
    (w) => !dead.has(w.id),
  );
  const live = new Set(workouts.map((w) => w.id));
  const sets = unionById(existing?.sets ?? [], incoming.sets ?? []).filter(
    (s) => s.workoutId === undefined || live.has(s.workoutId),
  );
  const exercises = unionById(existing?.exercises ?? [], incoming.exercises ?? []);

  return { ...incoming, workouts, sets, exercises };
}

const MAX_BYTES = 50 * 1024 * 1024; // a decade of workouts is ~2MB; 50MB is generous

function sanitizeEmail(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9@._+-]/g, "_");
}

export function backupKeys(email: string, now: Date) {
  const who = sanitizeEmail(email);
  const stamp = now.toISOString().slice(0, 19).replaceAll(":", "-");
  return {
    // Dated snapshots live under snapshots/ so an R2 lifecycle rule can
    // expire them without ever touching the latest.json pointers.
    snapshot: `snapshots/${who}/${stamp}.json`,
    latest: `backups/${who}/latest.json`,
  };
}

export interface StoredSummary {
  workouts: number;
  sets: number;
}

export async function storeBackup(
  bucket: BackupBucket,
  email: string,
  json: string,
  now: Date,
  /** Workouts the journal says are deleted — union can't drop rows on its own. */
  tombstonedWorkoutIds: string[] = [],
): Promise<StoredSummary> {
  if (json.length > MAX_BYTES) {
    throw new Error("Backup too large");
  }
  const data = JSON.parse(json) as BackupData;
  if (data.format !== "liftlog-backup" || data.version !== 1) {
    throw new Error("Not a LiftLog backup");
  }

  const keys = backupKeys(email, now);

  // The dated snapshot is this device's own view, verbatim: the forensic
  // record of what it held. Never merged — that's what makes it a rollback.
  await bucket.put(keys.snapshot, json);

  // The shared view. Conditional on the etag we read, so a publish that lands
  // between our read and our write is retried against it rather than lost.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await bucket.get(keys.latest);
    const existing = current ? (JSON.parse(await current.text()) as BackupData) : null;
    const merged = mergeBackups(existing, data, tombstonedWorkoutIds);

    const written = await bucket.put(
      keys.latest,
      JSON.stringify(merged),
      current?.etag ? { onlyIf: { etagMatches: current.etag } } : undefined,
    );
    if (written !== null) {
      return {
        workouts: merged.workouts?.length ?? 0,
        sets: merged.sets?.length ?? 0,
      };
    }
  }
  throw new Error("Backup contended — another device published first; try again");
}

export async function fetchLatestBackup(
  bucket: BackupBucket,
  email: string,
): Promise<string | null> {
  const keys = backupKeys(email, new Date(0));
  const obj = await bucket.get(keys.latest);
  return obj ? obj.text() : null;
}
