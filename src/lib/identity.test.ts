import { describe, it, expect } from "vitest";
import { pickActiveUser } from "./identity";
import type { User } from "./types";

const isaac: User = {
  id: "user-1",
  email: "lifter-one@example.com",
  name: "Isaac",
  accent: "blue",
  unit: "kg",
};
const sam: User = {
  id: "user-2",
  email: "lifter-two@example.com",
  name: "Sam",
  accent: "green",
  unit: "kg",
};
const users = [isaac, sam];

describe("pickActiveUser", () => {
  it("the Access identity wins over everything", () => {
    expect(pickActiveUser(users, "lifter-two@example.com", "user-1")).toBe(sam);
  });

  it("matches identity email case-insensitively", () => {
    expect(pickActiveUser(users, "Lifter-One@Example.COM", null)).toBe(isaac);
  });

  it("falls back to the saved selection when there is no identity (offline, dev)", () => {
    expect(pickActiveUser(users, null, "user-2")).toBe(sam);
  });

  it("falls back to the first user when nothing matches", () => {
    expect(pickActiveUser(users, null, null)).toBe(isaac);
    expect(pickActiveUser(users, "stranger@example.com", null)).toBe(isaac);
  });

  it("an unknown identity does not override a saved selection", () => {
    // e.g. an extra email added to the Access policy that isn't a configured user
    expect(pickActiveUser(users, "stranger@example.com", "user-2")).toBe(sam);
  });

  it("returns null for an empty user list", () => {
    expect(pickActiveUser([], "lifter-one@example.com", null)).toBeNull();
  });
});
