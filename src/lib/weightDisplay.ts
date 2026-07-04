/** Weight stepper helpers for the mid-workout exercise sheet. */

/** Round away binary-FP noise (and a stray -0) from 2.5kg steps. */
export function roundStep(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

/** Weight label with a real minus glyph (U+2212) for assisted (negative)
 * weights, matching the stepper buttons. */
export function fmtWeight(kg: number): string {
  return kg < 0 ? `−${Math.abs(kg)}kg` : `${kg}kg`;
}
