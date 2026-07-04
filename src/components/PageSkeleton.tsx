"use client";

/** Stable chrome shown while Dexie loads — a tab switch shows the page's
 * skeleton instantly instead of a blank black frame. */

import { AppHeader } from "./AppHeader";

export function PageSkeleton({ title }: { title?: string }) {
  return (
    <div aria-hidden className="motion-safe:animate-pulse">
      <AppHeader title={title} />
      <div className="glass mb-3 h-28" />
      <div className="glass mb-3 h-40" />
      <div className="glass h-40 opacity-60" />
    </div>
  );
}
