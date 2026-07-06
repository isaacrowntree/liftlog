"use client";

/** Program mode's signature control: a set drawn as a weight plate.
 * Tap: empty → full target → decrement → 0 → empty. */

export function SetPlate({
  target,
  value,
  onChange,
  size,
  bonus = false,
}: {
  target: number;
  /** null = not attempted; otherwise reps done. */
  value: number | null;
  onChange: (next: number | null) => void;
  /** Fixed px size; omit to fill the parent's grid cell. */
  size?: number;
  /** An extra set added beyond the prescription — marked so it doesn't read
   * as a missing prescribed set. */
  bonus?: boolean;
}) {
  const next = value === null ? target : value === 0 ? null : value - 1;

  const state =
    value === null
      ? "empty"
      : value === target
        ? "done"
        : value === 0
          ? "zero"
          : "partial";

  const border =
    state === "done"
      ? "border-accent"
      : state === "partial"
        ? "border-plate-15"
        : state === "zero"
          ? "border-plate-25"
          : // Empty bonus set: dashed, so it reads as "extra / removable"
            // rather than a prescribed set you forgot to log.
            bonus
            ? "border-dashed border-accent/40"
            : "border-[#2E3036]";
  const bg =
    state === "done"
      ? "bg-accent-soft"
      : state === "partial"
        ? "bg-[rgba(242,194,27,0.10)]"
        : state === "zero"
          ? "bg-[rgba(232,67,63,0.10)]"
          : "bg-black";
  const ink = state === "empty" ? "text-ink-dim" : "text-ink";

  const label =
    value === null
      ? `${bonus ? "Bonus set" : "Set"} pending, ${target} reps target. Tap to log all reps.`
      : `${value} of ${target} reps logged. Tap to change.`;

  return (
    <button
      aria-label={label}
      onClick={() => {
        // Native-feel haptic tick on the core interaction.
        if (typeof navigator !== "undefined") navigator.vibrate?.(10);
        onChange(next);
      }}
      style={size !== undefined ? { width: size, height: size } : undefined}
      className={`disp flex flex-none items-center justify-center rounded-full border-4 text-[17px] transition-transform active:scale-90 ${
        size === undefined ? "aspect-square w-full" : ""
      } ${border} ${bg} ${ink}`}
    >
      {value === null ? (
        <span className="opacity-70">{target}</span>
      ) : (
        value
      )}
    </button>
  );
}
