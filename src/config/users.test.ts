import { describe, it, expect } from "vitest";
import { themeForConfig, type UserConfig } from "./users";

function cfg(overrides: Partial<UserConfig>): UserConfig {
  return {
    id: "u",
    name: "N",
    email: "n@example.com",
    accent: "blue",
    unit: "kg",
    template: "fiveByFive",
    ...overrides,
  };
}

describe("themeForConfig (per-user skin)", () => {
  it("defaults the 5×5 progression variant to dark", () => {
    expect(themeForConfig(cfg({ template: "fiveByFive" }))).toBe("dark");
  });

  it("defaults the Strong-style routine variant to light", () => {
    expect(themeForConfig(cfg({ template: "routine" }))).toBe("light");
  });

  it("honours an explicit theme over the template default", () => {
    expect(themeForConfig(cfg({ template: "routine", theme: "dark" }))).toBe("dark");
    expect(themeForConfig(cfg({ template: "fiveByFive", theme: "light" }))).toBe(
      "light",
    );
  });
});
