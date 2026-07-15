import { describe, it, expect } from "vitest";
import {
  backupKeys,
  storeBackup,
  fetchLatestBackup,
  mergeBackups,
  type BackupBucket,
} from "./backupStore";

/** Models R2's conditional put: a write carrying a stale etag is refused
 * (returns null) rather than silently clobbering. */
function fakeBucket() {
  const store = new Map<string, string>();
  const etags = new Map<string, string>();
  let seq = 0;
  const bucket: BackupBucket = {
    async put(key, value, options) {
      const expected = options?.onlyIf?.etagMatches;
      if (expected !== undefined && etags.get(key) !== expected) return null;
      store.set(key, value);
      etags.set(key, `etag-${++seq}`);
      return {};
    },
    async get(key) {
      const v = store.get(key);
      return v === undefined
        ? null
        : { text: async () => v, etag: etags.get(key) };
    },
  };
  return { bucket, store, etags };
}

const backup = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: "liftlog-backup",
    version: 1,
    exportedAt: "2026-07-03T00:00:00Z",
    userId: "user-1",
    exercises: [],
    programs: [],
    programDays: [],
    programExercises: [],
    workouts: [],
    sets: [],
    ...over,
  });
const parse = (s: string | undefined) => JSON.parse(s ?? "{}");

describe("backupKeys", () => {
  it("namespaces by sanitized email and keeps a latest pointer", () => {
    const keys = backupKeys("Lifter-One@Example.com", new Date("2026-07-03T10:30:00Z"));
    expect(keys.latest).toBe("backups/lifter-one@example.com/latest.json");
    expect(keys.snapshot).toBe("snapshots/lifter-one@example.com/2026-07-03T10-30-00.json");
  });

  it("strips path-hostile characters", () => {
    const keys = backupKeys("a/b\\c#?d@example.com", new Date("2026-07-03T00:00:00Z"));
    expect(keys.latest).not.toMatch(/[/\\#?]{2}|\.\./);
    expect(keys.latest).toBe("backups/a_b_c__d@example.com/latest.json");
  });
});

describe("storeBackup", () => {
  it("writes both a dated snapshot and the latest pointer", async () => {
    const { bucket, store } = fakeBucket();
    const VALID = backup({ workouts: [{ id: "w1" }], sets: [{ id: "s1", workoutId: "w1" }, { id: "s2", workoutId: "w1" }] });
    const result = await storeBackup(bucket, "a@b.co", VALID, new Date("2026-07-03T10:30:00Z"));
    expect(result.workouts).toBe(1);
    expect(result.sets).toBe(2);
    expect(store.size).toBe(2);
    expect(parse(store.get("backups/a@b.co/latest.json")).workouts).toEqual([{ id: "w1" }]);
  });

  /** latest.json is the SHARED view. It used to be a blind put of whatever the
   * uploading device happened to hold, so a device that hadn't pulled yet
   * published a history in which the workouts it never saw simply never
   * happened. That is how a real workout was erased from the cloud. */
  it("keeps workouts the uploading device never saw", async () => {
    const { bucket, store } = fakeBucket();
    // Device A publishes its workout.
    await storeBackup(bucket, "a@b.co", backup({
      workouts: [{ id: "wA" }], sets: [{ id: "sA", workoutId: "wA" }],
    }), new Date("2026-07-03T10:00:00Z"));

    // Device B has never pulled wA, and publishes only its own.
    await storeBackup(bucket, "a@b.co", backup({
      workouts: [{ id: "wB" }], sets: [{ id: "sB", workoutId: "wB" }],
    }), new Date("2026-07-03T11:00:00Z"));

    const latest = parse(store.get("backups/a@b.co/latest.json"));
    expect(latest.workouts.map((w: { id: string }) => w.id).sort()).toEqual(["wA", "wB"]);
    expect(latest.sets.map((s: { id: string }) => s.id).sort()).toEqual(["sA", "sB"]);
  });

  it("keeps the dated snapshot as the device's own unmerged view", async () => {
    const { bucket, store } = fakeBucket();
    await storeBackup(bucket, "a@b.co", backup({ workouts: [{ id: "wA" }] }), new Date("2026-07-03T10:00:00Z"));
    const own = backup({ workouts: [{ id: "wB" }] });
    await storeBackup(bucket, "a@b.co", own, new Date("2026-07-03T11:00:00Z"));

    // The snapshot is the forensic record of what THIS device held.
    expect(store.get("snapshots/a@b.co/2026-07-03T11-00-00.json")).toBe(own);
  });

  /** Union-by-id can never drop a row, so a deleted workout would walk back in
   * from whichever device still holds it. The journal's deleteWorkout ops are
   * the authority on what is gone. */
  it("drops tombstoned workouts and their orphaned sets", async () => {
    const { bucket, store } = fakeBucket();
    await storeBackup(bucket, "a@b.co", backup({
      workouts: [{ id: "wKeep" }, { id: "wGone" }],
      sets: [{ id: "s1", workoutId: "wKeep" }, { id: "s2", workoutId: "wGone" }],
    }), new Date("2026-07-03T10:00:00Z"));

    // A device that still holds the deleted workout re-publishes it.
    await storeBackup(bucket, "a@b.co", backup({
      workouts: [{ id: "wKeep" }, { id: "wGone" }],
      sets: [{ id: "s1", workoutId: "wKeep" }, { id: "s2", workoutId: "wGone" }],
    }), new Date("2026-07-03T11:00:00Z"), ["wGone"]);

    const latest = parse(store.get("backups/a@b.co/latest.json"));
    expect(latest.workouts.map((w: { id: string }) => w.id)).toEqual(["wKeep"]);
    expect(latest.sets.map((s: { id: string }) => s.id)).toEqual(["s1"]);
  });

  it("refuses to publish against a stale read rather than clobbering", async () => {
    const { bucket, etags } = fakeBucket();
    await storeBackup(bucket, "a@b.co", backup({ workouts: [{ id: "wA" }] }), new Date("2026-07-03T10:00:00Z"));
    // Every conditional put fails: someone else keeps winning the race.
    const contended: BackupBucket = {
      ...bucket,
      async put(key, value, options) {
        if (options?.onlyIf) return null;
        return bucket.put(key, value);
      },
    };
    await expect(
      storeBackup(contended, "a@b.co", backup({ workouts: [{ id: "wB" }] }), new Date("2026-07-03T11:00:00Z")),
    ).rejects.toThrow(/contend|busy|try again/i);
    expect(etags.size).toBeGreaterThan(0);
  });

  it("rejects payloads that are not LiftLog backups", async () => {
    const { bucket } = fakeBucket();
    await expect(storeBackup(bucket, "a@b.co", '{"nope":true}', new Date())).rejects.toThrow(
      /not a liftlog backup/i,
    );
    await expect(storeBackup(bucket, "a@b.co", "not json", new Date())).rejects.toThrow();
  });

  it("rejects oversized payloads", async () => {
    const { bucket } = fakeBucket();
    const VALID = backup();
    const huge = VALID.slice(0, -1) + ',"pad":"' + "x".repeat(51 * 1024 * 1024) + '"}';
    await expect(storeBackup(bucket, "a@b.co", huge, new Date())).rejects.toThrow(/too large/i);
  });
});

describe("fetchLatestBackup", () => {
  it("returns the latest backup or null", async () => {
    const { bucket } = fakeBucket();
    expect(await fetchLatestBackup(bucket, "a@b.co")).toBeNull();
    await storeBackup(bucket, "a@b.co", backup({ workouts: [{ id: "w1" }] }), new Date());
    expect(parse(await fetchLatestBackup(bucket, "a@b.co") ?? "{}").workouts).toEqual([{ id: "w1" }]);
  });

  it("does not leak across users", async () => {
    const { bucket } = fakeBucket();
    await storeBackup(bucket, "a@b.co", backup(), new Date());
    expect(await fetchLatestBackup(bucket, "other@b.co")).toBeNull();
  });
});

describe("mergeBackups", () => {
  const file = (over: Record<string, unknown> = {}) => JSON.parse(backup(over));

  it("returns the incoming file when nothing is published yet", () => {
    const incoming = file({ workouts: [{ id: "w1" }] });
    expect(mergeBackups(null, incoming, []).workouts).toEqual([{ id: "w1" }]);
  });

  it("lets the incoming row win on conflict — it is the fresher edit", () => {
    const existing = file({ workouts: [{ id: "w1", notes: "old" }] });
    const incoming = file({ workouts: [{ id: "w1", notes: "corrected" }] });
    expect(mergeBackups(existing, incoming, []).workouts).toEqual([{ id: "w1", notes: "corrected" }]);
  });

  it("carries program structure from the uploading device", () => {
    const existing = file({ programs: [{ id: "p1", name: "old" }] });
    const incoming = file({ programs: [{ id: "p1", name: "edited" }] });
    // Structure is not journalled, so it stays last-writer-wins. Documented,
    // not accidental: the alternative is resurrecting deleted exercises.
    expect(mergeBackups(existing, incoming, []).programs).toEqual([{ id: "p1", name: "edited" }]);
  });
});
