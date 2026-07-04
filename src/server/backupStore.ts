/** R2-backed backup snapshots, one namespace per Access identity.
 * Pure functions over a minimal bucket interface so the logic is testable
 * without a Workers runtime. */

export interface BackupBucket {
  put(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
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
): Promise<StoredSummary> {
  if (json.length > MAX_BYTES) {
    throw new Error("Backup too large");
  }
  const data = JSON.parse(json) as {
    format?: string;
    version?: number;
    workouts?: unknown[];
    sets?: unknown[];
  };
  if (data.format !== "liftlog-backup" || data.version !== 1) {
    throw new Error("Not a LiftLog backup");
  }

  const keys = backupKeys(email, now);
  await bucket.put(keys.snapshot, json);
  await bucket.put(keys.latest, json);
  return {
    workouts: data.workouts?.length ?? 0,
    sets: data.sets?.length ?? 0,
  };
}

export async function fetchLatestBackup(
  bucket: BackupBucket,
  email: string,
): Promise<string | null> {
  const keys = backupKeys(email, new Date(0));
  const obj = await bucket.get(keys.latest);
  return obj ? obj.text() : null;
}
