import { createElement, type ReactNode } from "react";
import type { SvgNode } from "../../lib/moodboards";

/**
 * Tegner en SVG fra moodboards.json (D-3) med vanlige React-elementer, uten
 * dangerouslySetInnerHTML (Petter 25.10, valg T: C). Bare elementene og
 * attributtene under godtas; alt annet hoppes over. Parseren i
 * scripts/moodboards/parse.ts kaster allerede ved noe annet, og
 * moodboards.test.ts sjekker at listene er like.
 *
 * Id-ene i `defs` (moenstre og gradienter) og `url(#…)` faar prefikset, saa
 * to moodboard paa samme side ikke bruker hverandres moenstre.
 */

const TAGS = new Set(["svg", "defs", "pattern", "linearGradient", "stop", "g", "rect", "path", "circle", "ellipse"]);

/** Navnet i kilden → navnet i React. */
const ATTRS: Record<string, string> = {
  "aria-hidden": "aria-hidden",
  cx: "cx",
  cy: "cy",
  d: "d",
  fill: "fill",
  "fill-opacity": "fillOpacity",
  height: "height",
  id: "id",
  offset: "offset",
  patternUnits: "patternUnits",
  preserveAspectRatio: "preserveAspectRatio",
  r: "r",
  rx: "rx",
  ry: "ry",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  stroke: "stroke",
  "stroke-dasharray": "strokeDasharray",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-opacity": "strokeOpacity",
  "stroke-width": "strokeWidth",
  viewBox: "viewBox",
  width: "width",
  x: "x",
  x1: "x1",
  x2: "x2",
  y: "y",
  y1: "y1",
  y2: "y2",
};

function render(node: SvgNode, prefix: string, key: number, className?: string): ReactNode {
  const [tag, attrs, children] = node;
  if (!TAGS.has(tag)) return null;
  const props: Record<string, string | number> = { key };
  for (const [name, value] of Object.entries(attrs)) {
    const prop = ATTRS[name];
    if (prop === undefined) continue;
    if (name === "id") props.id = `${prefix}-${value}`;
    else props[prop] = value.replace(/url\(#([\w-]+)\)/g, `url(#${prefix}-$1)`);
  }
  if (className !== undefined) props.className = className;
  return createElement(tag, props, ...children.map((child, i) => render(child, prefix, i)));
}

/** Én tegning eller flis. Alltid aria-hidden: teksten ved siden av sier hva den er. */
export function SvgArt({ node, prefix, className }: { node: SvgNode; prefix: string; className?: string }) {
  const [tag, attrs, children] = node;
  return render([tag, { ...attrs, "aria-hidden": "true" }, children], prefix, 0, className);
}

/** Det felles `<defs>`-et, usynlig, som i moodboardene. */
export function SvgDefs({ defs, prefix }: { defs: SvgNode[]; prefix: string }) {
  return (
    <SvgArt
      node={["svg", { width: "0", height: "0" }, [["defs", {}, defs]]]}
      prefix={prefix}
      className="absolute"
    />
  );
}
