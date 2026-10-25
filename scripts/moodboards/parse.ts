/**
 * Leser ett moodboard (`StilNN_….dc.html` fra Cowork, D-3 dag 54) og gir
 * dataene stilvelgeren viser. Ren funksjon uten avhengigheter: brukt av
 * lag-data.ts og av moodboards.test.ts, som kjoerer den paa de byte-like
 * kopiene i app/lib/testdata/moodboard/ og krever at resultatet er likt
 * app/lib/moodboards.json.
 *
 * Kaster hvis formen avviker (feil antall fliser, moebelkort eller farger,
 * ukjent SVG-element eller -attributt), saa et nytt moodboard aldri gir
 * halve data stille. «Cowork anbefaler», «Reserve» og pynt-prikkene leses
 * ikke (interne, og pynt kommer fra stilpakker_v3.json).
 */

/** Et SVG-element: [tag, attributter, barn]. Tekst finnes ikke i tegningene. */
export type SvgNode = [string, Record<string, string>, SvgNode[]];

export interface MoodboardTile {
  navn: string;
  svg: SvgNode;
}

export interface MoodboardFurniture {
  /** «Sofa», «Lenestoler i par», «Pynt» … (det i fet skrift). */
  etikett: string;
  tekst: string;
  svg: SvgNode;
}

export interface MoodboardSwatch {
  navn: string;
  hex: string;
}

export interface ParsedMoodboard {
  nr: string;
  navn: string;
  kategori: string;
  setning: string;
  tenkPaa: string;
  /** Innholdet i det felles `<defs>` (moenstre og gradienter). */
  defs: SvgNode[];
  /** Seks; den foerste er den store flisen. */
  materialer: MoodboardTile[];
  /** Seks: fire store tegninger og to smaa (Kunst eller Pynt, og Gulv). */
  mobler: MoodboardFurniture[];
  palett: MoodboardSwatch[];
  passerFor: string;
  unnga: string;
}

/** Elementene tegningene kan ha. SvgArt.tsx har den samme lista. */
export const SVG_TAGS = [
  "svg",
  "defs",
  "pattern",
  "linearGradient",
  "stop",
  "g",
  "rect",
  "path",
  "circle",
  "ellipse",
] as const;

/** Attributtene tegningene kan ha (navnet i kilden). SvgArt.tsx oversetter dem. */
export const SVG_ATTRS = [
  "aria-hidden",
  "cx",
  "cy",
  "d",
  "fill",
  "fill-opacity",
  "height",
  "id",
  "offset",
  "patternUnits",
  "preserveAspectRatio",
  "r",
  "rx",
  "ry",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
] as const;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name: string) => ENTITIES[name]);
}

function fail(nr: string, what: string): never {
  throw new Error(`Moodboard ${nr}: ${what}`);
}

/** Ett treff, eller kast. */
function one(source: string, re: RegExp, nr: string, what: string): RegExpMatchArray {
  const all = [...source.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))];
  if (all.length !== 1) fail(nr, `${what}: ${all.length} treff, ventet 1`);
  return all[0];
}

const TAG_RE = /<(\/?)([A-Za-z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
const ATTR_RE = /([\w:-]+)="([^"]*)"/g;

/**
 * Gjoer ett `<svg …>…</svg>` om til et tre. Hvert element maa vaere lukket
 * (slik kildene er), og bare SVG_TAGS og SVG_ATTRS godtas, bortsett fra
 * `style` paa rot-svg-en, som droppes (bare `position: absolute` paa defs).
 */
export function parseSvg(markup: string, nr = "?"): SvgNode {
  const root: SvgNode = ["#root", {}, []];
  const stack: SvgNode[] = [root];
  let last = 0;
  for (const m of markup.matchAll(TAG_RE)) {
    if (markup.slice(last, m.index).trim() !== "") fail(nr, `tekst i SVG: «${markup.slice(last, m.index).trim()}»`);
    last = m.index + m[0].length;
    const [, closing, tag, attrText, selfClosing] = m;
    if (!(SVG_TAGS as readonly string[]).includes(tag)) fail(nr, `ukjent SVG-element <${tag}>`);
    if (closing) {
      const open = stack.pop();
      if (open === undefined || open[0] !== tag) fail(nr, `</${tag}> lukker ${open?.[0]}`);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [, name, value] of attrText.matchAll(ATTR_RE)) {
      if (name === "style" && stack.length === 1) continue;
      if (!(SVG_ATTRS as readonly string[]).includes(name)) fail(nr, `ukjent attributt ${name} paa <${tag}>`);
      attrs[name] = decode(value);
    }
    const node: SvgNode = [tag, attrs, []];
    stack[stack.length - 1][2].push(node);
    if (!selfClosing) stack.push(node);
  }
  if (markup.slice(last).trim() !== "") fail(nr, "tekst etter SVG");
  if (stack.length !== 1 || root[2].length !== 1) fail(nr, "SVG-en er ikke ett lukket element");
  return root[2][0];
}

function svgsIn(markup: string): string[] {
  return [...markup.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((m) => m[0]);
}

export function parseMoodboard(html: string): ParsedMoodboard {
  const head = one(html, /<span[^>]*>(\d\d) · ([^<]+)<\/span>\s*<h2[^>]*>([^<]+)<\/h2>\s*<span[^>]*>([^<]+)<\/span>/, "??", "kategori, navn og setning");
  const nr = head[1];

  const defsMarkup = one(html, /<svg width="0" height="0"[^>]*>[\s\S]*?<\/svg>/, nr, "defs")[0];
  const defsRoot = parseSvg(defsMarkup, nr);
  if (defsRoot[2].length !== 1 || defsRoot[2][0][0] !== "defs") fail(nr, "defs-svg-en har ikke ett <defs>");

  const tenk = one(html, /<span style="color: #5F5A52">Tenk på<\/span> ([^<]+)<\/span>/, nr, "«Tenk på»");

  const tiles = [
    ...html.matchAll(
      /<div style="[^"]*position: relative; border-radius: 12px; overflow: hidden">\s*(<svg\b[\s\S]*?<\/svg>)\s*<span[^>]*>([^<]+)<\/span>\s*<\/div>/g
    ),
  ];
  if (tiles.length !== 6) fail(nr, `${tiles.length} materialfliser, ventet 6`);

  const figures = [...html.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/g)];
  if (figures.length !== 6) fail(nr, `${figures.length} moebelkort, ventet 6`);
  const mobler = figures.map(([, inner]) => {
    const svgs = svgsIn(inner);
    if (svgs.length !== 1) fail(nr, "moebelkort uten akkurat én tegning");
    const cap = inner.match(/<figcaption[^>]*><b>([^<]+):<\/b> ([^<]+)<\/figcaption>/);
    if (cap === null) fail(nr, "moebelkort uten «Etikett: tekst»");
    return { etikett: decode(cap[1]), tekst: decode(cap[2]), svg: parseSvg(svgs[0], nr) };
  });

  const palett = [
    ...html.matchAll(
      /<span style="font-size: 12px; font-weight: 500">([^<]+)<\/span><span style="font-family: 'Geist Mono', monospace; font-size: 11px; color: #5F5A52">(#[0-9A-F]{6})<\/span>/g
    ),
  ].map(([, navn, hex]) => ({ navn: decode(navn), hex }));
  if (palett.length !== 6) fail(nr, `${palett.length} farger, ventet 6`);

  return {
    nr,
    navn: decode(head[3]),
    kategori: decode(head[2]),
    setning: decode(head[4]),
    tenkPaa: decode(tenk[1]),
    defs: defsRoot[2][0][2],
    materialer: tiles.map(([, svg, navn]) => ({ navn: decode(navn), svg: parseSvg(svg, nr) })),
    mobler,
    palett,
    passerFor: decode(one(html, /<b>Passer for:<\/b> ([^<]+)<\/span>/, nr, "«Passer for»")[1]),
    unnga: decode(one(html, /<b>Unngå:<\/b> ([^<]+)<\/span>/, nr, "«Unngå»")[1]),
  };
}

export interface RoomIcon {
  /** `furnish_as`-verdien (living, living_dining …). */
  id: string;
  ikon: SvgNode;
}

/**
 * Romikonene fra designet for velgeren (`Styling.dc.html`, del «1 · Rommet»,
 * D-3 kompakt). Rekkefoelgen og flagget per rom staar i `roomDefs` i
 * skriptet nederst i fila; ikonet staar i `<sc-if value="{{item.<flagg>}}">`.
 */
export function parseRoomIcons(html: string): RoomIcon[] {
  const defs = [...html.matchAll(/\['(\w+)', '[^']+', '[^']+', '(is\w+)'\]/g)];
  if (defs.length === 0) fail("Styling", "fant ingen roomDefs");
  return defs.map(([, id, flag]) => {
    const svg = one(html, new RegExp(`<sc-if value="\\{\\{item\\.${flag}\\}\\}"[^>]*>(<svg\\b[\\s\\S]*?<\\/svg>)<\\/sc-if>`), "Styling", `ikon for ${id}`);
    return { id, ikon: parseSvg(svg[1], "Styling") };
  });
}
