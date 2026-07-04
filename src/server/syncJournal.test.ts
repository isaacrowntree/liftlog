import { describe, it, expect } from "vitest";
import {
  MemoryOpStore,
  handlePush,
  handlePull,
  type JournalOp,
} from "./syncJournal";

const op = (opId: string, n = 1): JournalOp => ({
  opId,
  kind: "finishedWorkout",
  payload: { n },
});

describe("sync journal (per-user op log)", () => {
  it("assigns increasing sequence numbers to pushed ops", () => {
    const store = new MemoryOpStore();
    const r1 = handlePush(store, [op("a"), op("b")]);
    expect(r1.seq).toBe(2);
    expect(r1.accepted).toBe(2);
    const r2 = handlePush(store, [op("c")]);
    expect(r2.seq).toBe(3);
  });

  it("ignores duplicate opIds (device retries are harmless)", () => {
    const store = new MemoryOpStore();
    handlePush(store, [op("a")]);
    const r = handlePush(store, [op("a"), op("b")]);
    expect(r.accepted).toBe(1);
    expect(handlePull(store, 0).ops).toHaveLength(2);
  });

  it("pull returns only ops after the cursor, with the new cursor", () => {
    const store = new MemoryOpStore();
    handlePush(store, [op("a"), op("b"), op("c")]);
    const r = handlePull(store, 1);
    expect(r.ops.map((o) => o.opId)).toEqual(["b", "c"]);
    expect(r.seq).toBe(3);
  });

  it("pull from the head returns nothing", () => {
    const store = new MemoryOpStore();
    handlePush(store, [op("a")]);
    const r = handlePull(store, 1);
    expect(r.ops).toHaveLength(0);
    expect(r.seq).toBe(1);
  });

  it("rejects malformed ops without poisoning the journal", () => {
    const store = new MemoryOpStore();
    const r = handlePush(store, [
      op("good"),
      { opId: "", kind: "x", payload: {} },
      { kind: "no-id" } as unknown as JournalOp,
    ]);
    expect(r.accepted).toBe(1);
    expect(handlePull(store, 0).ops.map((o) => o.opId)).toEqual(["good"]);
  });
});
