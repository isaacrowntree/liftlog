import { describe, it, expect } from "vitest";
import {
  backupKeys,
  storeBackup,
  fetchLatestBackup,
  type BackupBucket,
} from "./backupStore";

function fakeBucket() {
  const store = new Map<string, string>();
  const bucket: BackupBucket = {
    async put(key, value) {
      store.set(key, value);
    },
    async get(key) {
      const v = store.get(key);
      return v === undefined ? null : { text: async () => v };
    },
  };
  return { bucket, store };
}

const VALID = JSON.stringify({
  format: "liftlog-backup",
  version: 1,
  exportedAt: "2026-07-03T00:00:00Z",
  userId: "user-1",
  exercises: [],
  programs: [],
  programDays: [],
  programExercises: [],
  workouts: [{}],
  sets: [{}, {}],
});

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
    const result = await storeBackup(bucket, "a@b.co", VALID, new Date("2026-07-03T10:30:00Z"));
    expect(result.workouts).toBe(1);
    expect(result.sets).toBe(2);
    expect(store.size).toBe(2);
    expect(store.get("backups/a@b.co/latest.json")).toBe(VALID);
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
    const huge = VALID.slice(0, -1) + ',"pad":"' + "x".repeat(51 * 1024 * 1024) + '"}';
    await expect(storeBackup(bucket, "a@b.co", huge, new Date())).rejects.toThrow(/too large/i);
  });
});

describe("fetchLatestBackup", () => {
  it("returns the latest backup or null", async () => {
    const { bucket } = fakeBucket();
    expect(await fetchLatestBackup(bucket, "a@b.co")).toBeNull();
    await storeBackup(bucket, "a@b.co", VALID, new Date());
    expect(await fetchLatestBackup(bucket, "a@b.co")).toBe(VALID);
  });

  it("does not leak across users", async () => {
    const { bucket } = fakeBucket();
    await storeBackup(bucket, "a@b.co", VALID, new Date());
    expect(await fetchLatestBackup(bucket, "other@b.co")).toBeNull();
  });
});
