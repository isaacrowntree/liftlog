"use client";

/** Barbell loading diagram — one side of the bar, plates in IWF colors,
 * denomination labeled under every plate, plate math spelled out beneath. */

import { platesPerSide, PLATE_COLORS } from "@/lib/plates";

const PLATE_SIZE: Record<number, { w: number; h: number }> = {
  25: { w: 30, h: 100 },
  20: { w: 28, h: 100 },
  15: { w: 24, h: 84 },
  10: { w: 20, h: 66 },
  5: { w: 16, h: 50 },
  2.5: { w: 12, h: 38 },
  1.25: { w: 10, h: 28 },
};

export function PlateDiagram({
  totalKg,
  barKg = 20,
}: {
  totalKg: number;
  barKg?: number;
}) {
  const plates = platesPerSide(totalKg, barKg);
  const perSide = (totalKg - barKg) / 2;

  const H = 132;
  const mid = 58;
  const sleeveStart = 96;

  let x = sleeveStart + 10;
  const drawn = (plates ?? []).map((p, i) => {
    const size = PLATE_SIZE[p] ?? { w: 10, h: 30 };
    const cx = x + size.w / 2;
    const el = (
      <g key={i}>
        <rect
          x={x}
          y={mid - size.h / 2}
          width={size.w}
          height={size.h}
          rx={size.w / 2.6}
          fill={PLATE_COLORS[p] ?? "#9AA0AB"}
        />
        {/* hub */}
        <rect
          x={cx - 2.5}
          y={mid - 5}
          width={5}
          height={10}
          rx={2.5}
          fill="rgba(0,0,0,0.35)"
        />
        <text
          x={cx}
          y={H - 8}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill="var(--ink-dim)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {p}
        </text>
      </g>
    );
    x += size.w + 6;
    return el;
  });

  const sleeveEnd = Math.max(x + 8, sleeveStart + 60);
  // Wrap the viewBox tightly around the drawn bar (shaft → collar) instead of
  // a fixed 340 canvas — otherwise short loadouts leave the right half empty
  // and the whole diagram reads as small and left-aligned. A tight box lets
  // `w-full` scale the bar to fill the sheet and centre it.
  const contentW = sleeveEnd + 12;

  return (
    <figure className="mx-auto w-full max-w-[360px]">
      <svg
        viewBox={`0 0 ${contentW} ${H}`}
        // Cap the height so a light one-plate loadout doesn't balloon and
        // dominate the sheet; the bar centres within the width when capped.
        className="mx-auto block max-h-[132px] w-full"
        role="img"
        aria-label={
          plates && plates.length > 0
            ? `${totalKg}kg: ${plates.join(", ")} per side on a ${barKg}kg bar`
            : plates
              ? `Empty ${barKg}kg bar`
              : `${totalKg}kg is not loadable with standard plates`
        }
      >
        {/* shaft */}
        <rect x="8" y={mid - 4} width={sleeveStart - 8} height="8" rx="4" fill="#4A4C52" />
        {/* shoulder */}
        <rect x={sleeveStart - 6} y={mid - 11} width="10" height="22" rx="4" fill="#5C6069" />
        {/* sleeve */}
        <rect x={sleeveStart + 4} y={mid - 6} width={sleeveEnd - sleeveStart} height="12" rx="6" fill="#3A3C42" />
        {drawn}
        {/* collar clip at the end of the loaded plates */}
        {plates && plates.length > 0 && (
          <rect x={x + 2} y={mid - 9} width="7" height="18" rx="3" fill="#6E7480" />
        )}
        {plates && plates.length === 0 && (
          <text x={(sleeveStart + sleeveEnd) / 2 + 8} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-faint)">
            no plates
          </text>
        )}
      </svg>
      <figcaption className="mono mt-1 text-center text-[13px] text-ink-dim">
        {plates === null ? (
          <>not loadable with standard plates</>
        ) : plates.length === 0 ? (
          <>empty bar = {barKg}kg</>
        ) : (
          <>
            bar {barKg} + 2 × {perSide} ={" "}
            <span className="font-semibold text-ink">{totalKg}kg</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
