import type { LocalEditNumber } from "../../lib/api";
import type { LocalCompare } from "../../lib/local";
import { MARK } from "../../lib/studio";

/**
 * Boksene fra den lokale runden over bildet i sammenligningen (studio v2,
 * Dag 58), med samme nummer som i lista. En endring som ikke ble gjort, har
 * stiplet kant. Laget tar ikke imot pekeren, saa glideren virker som foer.
 * Punktene er 0–1 i resultatets ramme. Fargen er den samme som paa lerretet
 * (MARK i studio.ts; det finnes ingen blaa token).
 */
export function LocalEditBoxes({
  boxes,
  activeK,
}: {
  boxes: LocalCompare["boxes"];
  activeK: LocalEditNumber | null;
}) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
        {boxes.map((b) => (
          <rect
            key={b.k}
            x={b.from.x}
            y={b.from.y}
            width={b.to.x - b.from.x}
            height={b.to.y - b.from.y}
            fill={MARK}
            fillOpacity={b.k === activeK ? 0.3 : 0}
            stroke={MARK}
            strokeWidth={b.k === activeK ? 4 : 2}
            strokeDasharray={b.ok ? undefined : "6 4"}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {boxes.map((b) => (
        <span
          key={b.k}
          className={`absolute ml-1 mt-1 flex h-7 w-7 items-center justify-center rounded-pill border-2 border-surface text-sm font-semibold text-surface shadow-md ${
            b.k === activeK ? "bg-primary" : "bg-ink"
          }`}
          style={{ left: `${b.from.x * 100}%`, top: `${b.from.y * 100}%` }}
        >
          {b.k}
        </span>
      ))}
    </div>
  );
}
