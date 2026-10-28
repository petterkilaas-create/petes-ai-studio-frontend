import type { PlanMedia } from "../../../content/marketing/schema";

/**
 * Plantegningen i tjenestekortet (F4, designet Main.dc.html linje 198-240):
 * en haandtegnet skisse til venstre, en pil og en ryddig plan til hoeyre.
 * Serverkomponent. All tekst (aria-label, bildetekstene og rommene) kommer
 * fra innholdet; fargene er tokenene via klasser, ingen nye.
 *
 * Banene og plassene staar her, utenfor JSX, fordi de er tegning og ikke
 * tekst. Rommene plasseres i rekkefoelgen i innholdet (SKETCH_ROOMS og
 * PLAN_ROOMS); et rom uten plass tegnes ikke.
 */

type Plan = PlanMedia;

const VIEW_BOX = "0 0 400 200";

/** Skissen: ytterveggen og innerveggene, tegnet paa frihaand. */
const SKETCH_OUTLINE = "M14 30 C60 27 120 31 166 28 L168 172 C120 175 60 170 15 173 Z";
const SKETCH_WALLS = "M92 29 L94 98 M15 104 C40 102 62 106 93 101 M93 101 L95 172 M120 100 C140 98 150 103 167 100";
const SKETCH_ROOMS: readonly [number, number][] = [
  [34, 70],
  [110, 70],
  [30, 142],
  [114, 142],
];

const ARROW = "M182 100 H212 M204 92 L212 100 L204 108";

/** Gulvene i planen, i rekkefoelgen stue, sov, kjoekken, bad og gang. */
const FLOORS: readonly { x: number; y: number; width: number; height: number; className: string }[] = [
  { x: 228, y: 28, width: 94, height: 72, className: "fill-amber-bg" },
  { x: 322, y: 28, width: 62, height: 72, className: "fill-neutral-bg" },
  { x: 228, y: 100, width: 94, height: 72, className: "fill-green-bg" },
  { x: 322, y: 100, width: 62, height: 40, className: "fill-neutral-bg" },
  { x: 322, y: 140, width: 62, height: 32, className: "fill-surface" },
];

/** Innerveggene med aapningene til doerene, og doerbuene. */
const PLAN_WALLS = "M322 28 V64 M322 82 V172 M228 100 H268 M286 100 H322 M322 140 H384";
const PLAN_DOORS = "M268 100 A18 18 0 0 1 286 82 M322 64 A18 18 0 0 1 340 82";

const PLAN_ROOMS: readonly [number, number][] = [
  [246, 90],
  [336, 94],
  [240, 132],
  [358, 128],
  [332, 161],
];

const CAPTION_Y = 194;

export function PlanIllustration({ plan }: { plan: Plan }) {
  return (
    <svg viewBox={VIEW_BOX} role="img" aria-label={plan.label} className="h-full w-full" fontSize={10}>
      <g className="fill-none stroke-ink-2" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d={SKETCH_OUTLINE} />
        <path d={SKETCH_WALLS} />
      </g>
      <g className="fill-ink-2">
        {plan.sketch.rooms.map((room, i) =>
          SKETCH_ROOMS[i] ? (
            <text key={room} x={SKETCH_ROOMS[i][0]} y={SKETCH_ROOMS[i][1]}>
              {room}
            </text>
          ) : null
        )}
      </g>
      <text x={14} y={CAPTION_Y} className="fill-neutral-fg">
        {plan.sketch.caption}
      </text>

      <path d={ARROW} className="fill-none stroke-ink" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {FLOORS.map((f) => (
        <rect key={`${f.x}-${f.y}`} x={f.x} y={f.y} width={f.width} height={f.height} className={f.className} />
      ))}
      <g className="fill-none stroke-ink" strokeLinecap="square">
        <rect x={228} y={28} width={156} height={144} strokeWidth={4} />
        <path d={PLAN_WALLS} strokeWidth={2.5} />
        <path d={PLAN_DOORS} strokeWidth={1} />
      </g>
      <g className="fill-none stroke-neutral-fg" strokeWidth={1.2}>
        <rect x={240} y={40} width={44} height={18} rx={3} />
        <circle cx={300} cy={78} r={9} />
        <rect x={334} y={38} width={38} height={26} rx={3} />
        <rect x={238} y={148} width={70} height={14} />
        <rect x={332} y={108} width={20} height={24} rx={8} />
      </g>
      <g className="fill-ink">
        {plan.plan.rooms.map((room, i) =>
          PLAN_ROOMS[i] ? (
            <text key={room} x={PLAN_ROOMS[i][0]} y={PLAN_ROOMS[i][1]}>
              {room}
            </text>
          ) : null
        )}
      </g>
      <text x={228} y={CAPTION_Y} className="fill-neutral-fg">
        {plan.plan.caption}
      </text>
    </svg>
  );
}
