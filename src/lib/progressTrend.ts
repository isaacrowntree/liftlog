/** Trend summary behind a Progress sparkline.
 *
 * A line only carries signal when there are at least two sessions AND the
 * value actually moves. A single session, or a rep-based exercise logged at
 * the same reps every time, produces a dead-flat line that reads as a broken
 * chart — so callers hide the line and show a static label instead. */

export interface TrendSummary {
  /** Worth drawing a line: ≥2 sessions and some variation. */
  meaningful: boolean;
  /** ≥2 sessions, even if flat — distinguishes "steady" from "first session". */
  hasHistory: boolean;
  first: number;
  last: number;
  /** last − first (0 with fewer than two points). */
  delta: number;
  min: number;
  max: number;
}

export function summarizeTrend(points: number[]): TrendSummary {
  if (points.length === 0) {
    return { meaningful: false, hasHistory: false, first: 0, last: 0, delta: 0, min: 0, max: 0 };
  }
  const first = points[0];
  const last = points[points.length - 1];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const hasHistory = points.length >= 2;
  return {
    meaningful: hasHistory && max > min,
    hasHistory,
    first,
    last,
    delta: hasHistory ? last - first : 0,
    min,
    max,
  };
}

/** Signed change for the row chip: "+7.5", "−5". Empty when flat or single
 * session. Uses a real minus (−, U+2212) to match the app's tabular numbers. */
export function deltaLabel(summary: TrendSummary, unit = ""): string {
  if (!summary.meaningful || summary.delta === 0) return "";
  const sign = summary.delta > 0 ? "+" : "−";
  const mag = Math.round(Math.abs(summary.delta) * 10) / 10;
  return `${sign}${mag}${unit}`;
}
