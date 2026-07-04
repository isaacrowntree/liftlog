/** User identities are configuration, not code.
 *
 * Real names/emails live in `.env.local` (gitignored) as
 * NEXT_PUBLIC_LIFTLOG_USERS — a JSON array matching UserConfig[].
 * The committed defaults below are placeholders so the app runs (and tests
 * pass) on a fresh clone with zero personal data in the repo.
 */

export interface UserConfig {
  id: string;
  name: string;
  email: string;
  accent: "blue" | "green";
  unit: "kg" | "lb";
  /** Which program template to seed for this user. */
  template: "fiveByFive" | "routine";
  /** Per-user skin. Omit to default by template (routine → light,
   * fiveByFive → dark). */
  theme?: "dark" | "light";
  /** fiveByFive only: starting working weights (kg) per slot. */
  workingWeights?: Partial<Record<FiveByFiveSlot, number>>;
}

/** A user's skin: explicit config wins; otherwise the Strong-style routine
 * variant is light and the 5×5 progression variant is dark. */
export function themeForConfig(cfg: UserConfig): "dark" | "light" {
  return cfg.theme ?? (cfg.template === "routine" ? "light" : "dark");
}

export type FiveByFiveSlot =
  | "squatA"
  | "bench"
  | "row"
  | "dips"
  | "squatB"
  | "ohp"
  | "deadlift"
  | "pullups"
  | "chinups";

export const DEFAULT_USERS: UserConfig[] = [
  {
    id: "user-1",
    name: "Lifter One",
    email: "lifter-one@example.com",
    accent: "blue",
    unit: "kg",
    template: "fiveByFive",
  },
  {
    id: "user-2",
    name: "Lifter Two",
    email: "lifter-two@example.com",
    accent: "green",
    unit: "kg",
    template: "routine",
  },
];

export function loadUserConfig(): UserConfig[] {
  const raw = process.env.NEXT_PUBLIC_LIFTLOG_USERS;
  if (!raw) return DEFAULT_USERS;
  try {
    const parsed = JSON.parse(raw) as UserConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_USERS;
    return parsed.filter(
      (u) => u && typeof u.id === "string" && typeof u.name === "string",
    );
  } catch {
    console.warn("NEXT_PUBLIC_LIFTLOG_USERS is not valid JSON — using defaults");
    return DEFAULT_USERS;
  }
}
