"use client";

/** Keep the screen awake while a workout is active. */

import { useEffect } from "react";

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      try {
        const acquired = await navigator.wakeLock.request("screen");
        // The effect may have cleaned up while the request was in flight —
        // release immediately so the screen doesn't stay on forever.
        if (released) {
          await acquired.release().catch(() => {});
          return;
        }
        lock = acquired;
      } catch {
        // Battery saver or unsupported — the workout still works.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
