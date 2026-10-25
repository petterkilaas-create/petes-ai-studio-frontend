import { DEFAULT_BRAND } from "../../app/lib/brand.ts";
import { parseMoodboard, parseRoomIcons, type ParsedMoodboard, type RoomIcon, type SvgNode } from "./parse.ts";

/**
 * Setter sammen app/lib/moodboards.json (D-3): de 14 moodboardene i
 * nr-rekkefoelge, med id og pyntnivaa (`LEVEL_DEFAULT`) fra
 * stilpakker_v3.json og filnavnet til eksempelbildet, og romikonene fra
 * designet for velgeren (Styling.dc.html). Ren funksjon, saa
 * moodboards.test.ts kan lage fila paa nytt fra testdata og kreve at den er
 * byte-lik den som er committet.
 *
 * Merkenavnet i tekstene (tre av «Unngå») blir `{brand}`, som siden fyller
 * fra brand.ts, saa et foretak med eget navn ikke ser standardnavnet. Det er
 * den eneste endringen fra kildene.
 */

export interface MoodboardStyle extends ParsedMoodboard {
  id: string;
  /** Anbefalt pynt 1–5 (`LEVEL_DEFAULT` i stilpakker_v3.json). */
  pynt: number;
  /** Eksempelbildet i app/(app)/tjenester/bilder/stiler/. */
  bilde: string;
}

export interface MoodboardData {
  versjon: string;
  kilde: string;
  /** Romflisene i velgeren, i designets rekkefoelge. */
  rom: RoomIcon[];
  stiler: MoodboardStyle[];
}

interface StylePackage {
  nr: string;
  navn: string;
  id: string;
  LEVEL_DEFAULT: number;
}

export function buildData(
  htmls: readonly string[],
  stilpakker: { stiler: StylePackage[] },
  stylingHtml: string
): MoodboardData {
  const boards = htmls.map(parseMoodboard).sort((a, b) => a.nr.localeCompare(b.nr));
  if (boards.length !== stilpakker.stiler.length) {
    throw new Error(`${boards.length} moodboard, men ${stilpakker.stiler.length} stiler i stilpakker_v3.json`);
  }
  const stiler = boards.map((board, i): MoodboardStyle => {
    const pkg = stilpakker.stiler[i];
    if (pkg.nr !== board.nr || pkg.navn !== board.navn) {
      throw new Error(`Moodboard ${board.nr} «${board.navn}» passer ikke med ${pkg.nr} «${pkg.navn}» i stilpakker_v3.json`);
    }
    if (!Number.isInteger(pkg.LEVEL_DEFAULT) || pkg.LEVEL_DEFAULT < 1 || pkg.LEVEL_DEFAULT > 5) {
      throw new Error(`Stil ${pkg.nr}: LEVEL_DEFAULT ${pkg.LEVEL_DEFAULT} er ikke 1–5`);
    }
    return withBrandPlaceholder({ id: pkg.id, ...board, pynt: pkg.LEVEL_DEFAULT, bilde: `${board.nr}_${pkg.id}.jpg` });
  });
  return {
    versjon: "moodboards_v1",
    kilde:
      "Generert av scripts/moodboards/lag-data.ts fra Coworks moodboard (dag54/moodboard/Stil01-14 og Styling.dc.html) og LEVEL_DEFAULT i stilpakker_v3.json. Ikke rediger for hånd.",
    rom: parseRoomIcons(stylingHtml),
    stiler,
  };
}

/** Bytter merkenavnet med `{brand}` i alle tekster (ikke i tegningene). */
function withBrandPlaceholder<T>(value: T): T {
  if (typeof value === "string") return value.split(DEFAULT_BRAND.displayName).join("{brand}") as T;
  if (isSvgNode(value) || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(withBrandPlaceholder) as T;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withBrandPlaceholder(v)])) as T;
}

function isSvgNode(value: unknown): value is SvgNode {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === "string" &&
    typeof value[1] === "object" &&
    Array.isArray(value[2])
  );
}

/** JSON med innrykk, men hver tegning paa én linje, saa fila blir lesbar. */
export function formatData(data: MoodboardData): string {
  const fmt = (value: unknown, indent: string): string => {
    if (isSvgNode(value) || value === null || typeof value !== "object") return JSON.stringify(value);
    const inner = indent + "  ";
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      return `[\n${value.map((v) => inner + fmt(v, inner)).join(",\n")}\n${indent}]`;
    }
    const entries = Object.entries(value);
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${fmt(v, inner)}`).join(",\n")}\n${indent}}`;
  };
  return fmt(data, "") + "\n";
}
