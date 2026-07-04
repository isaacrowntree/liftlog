/** Resolve which configured user is active.
 * Precedence: Access identity match > saved device selection > first user. */

import type { User } from "./types";

export function pickActiveUser(
  users: User[],
  accessEmail: string | null,
  savedId: string | null,
): User | null {
  if (users.length === 0) return null;
  if (accessEmail) {
    const match = users.find(
      (u) => u.email.toLowerCase() === accessEmail.toLowerCase(),
    );
    if (match) return match;
  }
  if (savedId) {
    const saved = users.find((u) => u.id === savedId);
    if (saved) return saved;
  }
  return users[0];
}
