/** Graduated comeback deload, StrongLifts-style:
 * under 2 weeks off → train as planned; 2–4 weeks → −10%;
 * 4–8 weeks → −20%; 8+ weeks → −30%. */

export function deloadPctForLayoff(daysAway: number): number {
  if (daysAway >= 56) return 0.3;
  if (daysAway >= 28) return 0.2;
  if (daysAway >= 14) return 0.1;
  return 0;
}

/** Cut a working weight for a comeback. Never raises a weight, never goes
 * below the empty bar, and leaves bodyweight (0) and assisted (negative)
 * values untouched. */
export function applyLayoffDeload(weightKg: number, pct: number): number {
  if (weightKg <= 20 || pct <= 0) return weightKg;
  const cut = Math.floor((weightKg * (1 - pct)) / 2.5) * 2.5;
  return Math.max(cut, 20);
}

/** localStorage key holding the timestamp the user last accepted a layoff
 * deload offer, per user. */
export function deloadAckKey(userId: string): string {
  return `liftlog.layoffDeload.${userId}`;
}

/** Whether the comeback-deload banner should show: the layoff has to qualify
 * for a cut AND the user must not have already taken one since their last
 * workout. Accepting the offer (or finishing any workout) pushes lastEndTs
 * past the stored ack, so the banner stays gone until the next long gap. */
export function layoffDeloadOffered(args: {
  daysSince: number | null;
  ackTs: number;
  lastEndTs: number;
}): boolean {
  const { daysSince, ackTs, lastEndTs } = args;
  if (daysSince === null || deloadPctForLayoff(daysSince) <= 0) return false;
  return ackTs < lastEndTs;
}
