import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// Node 26 ships an experimental (and disabled) localStorage global that
// shadows jsdom's. Replace it with a working in-memory implementation.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => void storage.clear(),
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() {
      return storage.size;
    },
  },
});

// Deterministic user config for tests — exercises the same env-driven path
// production uses (.env.local), with fixed working weights the specs assert.
process.env.NEXT_PUBLIC_LIFTLOG_USERS = JSON.stringify([
  {
    id: "user-1",
    name: "Lifter One",
    email: "lifter-one@example.com",
    accent: "blue",
    unit: "kg",
    template: "fiveByFive",
    workingWeights: {
      squatA: 25,
      bench: 62.5,
      row: 80,
      dips: 2.5,
      squatB: 27.5,
      ohp: 40,
      deadlift: 120,
      pullups: -2.5,
      chinups: -2.5,
    },
  },
  {
    id: "user-2",
    name: "Lifter Two",
    email: "lifter-two@example.com",
    accent: "green",
    unit: "kg",
    template: "routine",
  },
]);
