/**
 * Hvilke tjenester og sider som er slaatt paa (TG-NEW-136, L0, Petter
 * 29.09/30.09). Bare skumring har merket vei (EU-ikonet). Klart vaer, Magic
 * Cleanup og Virtual Staging gir bare den umerkede PNG-en, saa de er skjult
 * for alle, ogsaa admin, til de er merket. Privacy Blur regnes ikke som
 * KI-endring.
 *
 * Slaa en tjeneste paa igjen ved aa endre EN linje i ENABLED. Koden for
 * tjenestene og sidene er beholdt. Backend har sin egen tillatelsesliste
 * (services/enabled.py, TG-NEW-138), som maa aapnes i samme slengen.
 *
 * Rene data og funksjoner (en type-import, og marketingAccess.ts uten egne
 * importer), saa modulen kan testes med node --test.
 */

import type { UiKey } from "./i18n";
import { START_PATH } from "./marketingAccess.ts";

export const ENABLED = {
  klart_vaer: false,
  magic_cleanup: false,
  virtual_stage: false,
  /** Proof-of-concept-siden /express-v2, ikke en tjeneste. */
  express_v2: false,
  privacy_blur: true,
  skumring: true,
} as const;

/** Ukjent id gir av: en ny tjeneste maa legges inn over foer den vises. */
export function isServiceEnabled(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENABLED, id)
    ? ENABLED[id as keyof typeof ENABLED]
    : false;
}

// ---------------------------------------------------------------------------
// Sider som styres av en tjeneste
// ---------------------------------------------------------------------------

/** Tjenester (TG-NEW-153): alle tjenestene samles her. /express sendes hit (next.config.ts). */
export const SERVICES_PATH = "/tjenester";
export const STAGING_PATH = "/staging";
export const EXPRESS_V2_PATH = "/express-v2";

const PAGE_SERVICE: Record<string, string> = {
  [STAGING_PATH]: "virtual_stage",
  [EXPRESS_V2_PATH]: "express_v2",
};

/**
 * Om en side er aapen. Sider som ikke styres av en tjeneste, er alltid
 * aapne. En stengt side viser bare «midlertidig ikke tilgjengelig».
 */
export function isPageEnabled(path: string): boolean {
  const service = PAGE_SERVICE[path];
  return service === undefined ? true : isServiceEnabled(service);
}

// ---------------------------------------------------------------------------
// Menyen
// ---------------------------------------------------------------------------

/** Id-en gir teksten (`nav.<id>` i ordlista) og ikonet (AppNav). */
export type NavId = "start" | "services" | "staging" | "history";

export interface NavLink {
  id: NavId;
  href: string;
  /** Skillelinje foer lenken. */
  dividerBefore?: boolean;
}

// Tekst, ikon og farger ligger i AppNav og ordlista (D1), ikke her.
const ALL_NAV_LINKS: NavLink[] = [
  { id: "start", href: START_PATH },
  { id: "services", href: SERVICES_PATH },
  { id: "staging", href: STAGING_PATH },
  { id: "history", href: "/history" },
];

/** Lenkene i menyen. Lenker som ikke er tjenester, vises alltid. */
export function navLinks(): NavLink[] {
  return ALL_NAV_LINKS.filter((l) => isPageEnabled(l.href));
}

// ---------------------------------------------------------------------------
// Tjenestevalget paa Tjenester (heter fortsatt express* internt, valg B1)
// ---------------------------------------------------------------------------

// "simple" = service alene (ingen params, backend-defaults gjelder).
// "scene"  = scene_transform med preset_id + scene-type-gate (TG-NEW-58).
export type ToolKind = "simple" | "scene";

export interface Tool {
  /** Id-en i ENABLED. Skiller Klart vaer (nivaa 1) fra skumring (nivaa 2). */
  id: string;
  service: string;
  presetId?: string;
  kind: ToolKind;
  /**
   * Scene-type-velger + "Tving eksterioer" for scene-kort. Standard true;
   * false der backend bestemmer bildetypen selv (skumring, nivaa 2).
   */
  sceneGate?: boolean;
  /** Tekstene staar i ordlista (D1c, brief §7); ikonet i tjenester/page.tsx. */
  titleKey: UiKey;
  descKey: UiKey;
}

export interface Category {
  id: string;
  titleKey: UiKey;
  items: Tool[];
}

// Fasit fra backendens service-enum. Flyttet hit fra app/express/page.tsx
// (L0) saa filtreringen kan testes. Tekstene ligger i ordlista (D1c); id,
// service og presetId sendes til backend og er uendret.
const CATEGORIES: Category[] = [
  // Lys og himmel foerst: kveldsbildet er hovedtjenesten, og /tjenester
  // uten ?tjeneste= aapner her (dag 38, Petter: S2).
  {
    id: "timetraveler",
    titleKey: "express.category.timetraveler",
    items: [
      {
        id: "klart_vaer",
        service: "scene_transform",
        presetId: "klart_vaer",
        kind: "scene",
        titleKey: "express.tool.klart_vaer.title",
        descKey: "express.tool.klart_vaer.desc",
      },
      {
        id: "skumring",
        service: "scene_transform",
        presetId: "skumring",
        kind: "scene",
        sceneGate: false,
        titleKey: "service.scene_transform",
        descKey: "express.tool.skumring.desc",
      },
    ],
  },
  {
    id: "fixit",
    titleKey: "express.category.fixit",
    items: [
      {
        id: "magic_cleanup",
        service: "magic_cleanup",
        kind: "simple",
        titleKey: "service.magic_cleanup",
        descKey: "express.tool.magic_cleanup.desc",
      },
      {
        id: "privacy_blur",
        service: "privacy_blur",
        kind: "simple",
        titleKey: "service.privacy_blur",
        descKey: "express.tool.privacy_blur.desc",
      },
      // Skjult inntil lawn_green-pipeline finnes i backend (Dag 21+)
      // {
      //   id: "lawn_green",
      //   service: "lawn_green",
      //   kind: "simple",
      //   icon: "🌿",
      //   title: "Lush Lawn",
      //   desc: "Turn dead or brown grass into a perfect, manicured green lawn.",
      // },
      // Skjult inntil pool_enhance-pipeline finnes i backend (Dag 21+)
      // {
      //   id: "pool_enhance",
      //   service: "pool_enhance",
      //   kind: "simple",
      //   icon: "🏊",
      //   title: "Pool Cleanup",
      //   desc: "Clean murky pool water into inviting, crystal-clear light blue.",
      // },
    ],
  },
  // Hele Atmosphere-kategorien skjult: alle kortene er backend-stubber uten
  // pipeline (lamp_on, fireplace_ignite, sky_replace). Vis igjen naar minst
  // ett kort har en faktisk pipeline i backend (Dag 21+).
  // {
  //   id: "atmosphere",
  //   title: "Atmosphere",
  //   icon: "🌌",
  //   items: [
  //     // Skjult inntil lamp_on-pipeline finnes i backend (Dag 21+)
  //     // {
  //     //   id: "lamp_on",
  //     //   service: "lamp_on",
  //     //   kind: "simple",
  //     //   icon: "💡",
  //     //   title: "Turn On Lights",
  //     //   desc: "Ignite interior lamps and fixtures without making it night.",
  //     // },
  //     // Skjult inntil fireplace_ignite-pipeline finnes i backend (Dag 21+)
  //     // {
  //     //   id: "fireplace_ignite",
  //     //   service: "fireplace_ignite",
  //     //   kind: "simple",
  //     //   icon: "🔥",
  //     //   title: "Virtual Fireplace",
  //     //   desc: "Ignite a realistic, cozy fire in an empty fireplace.",
  //     // },
  //     // Skjult inntil sky_replace-pipeline finnes i backend (Dag 21+)
  //     // {
  //     //   id: "sky_replace",
  //     //   service: "sky_replace",
  //     //   kind: "simple",
  //     //   icon: "🌤️",
  //     //   title: "Sky Replace",
  //     //   desc: "Swap a dull or blown-out sky for a clean, natural blue one.",
  //     // },
  //   ],
  // },
];

/** Kategoriene paa Tjenester med bare paaslaatte verktoey. Tomme kategorier skjules. */
export function expressCategories(): Category[] {
  return CATEGORIES.map((c) => ({
    ...c,
    items: c.items.filter((tool) => isServiceEnabled(tool.id)),
  })).filter((c) => c.items.length > 0);
}

/** Tjenestene som kan bestilles, i samme rekkefoelge som paa Tjenester. */
export function orderableTools(): Tool[] {
  return expressCategories().flatMap((c) => c.items);
}

// ---------------------------------------------------------------------------
// Forhaandsvalg fra adressen (TG-NEW-153, Petter 05.10): /tjenester?tjeneste=<id>
// ---------------------------------------------------------------------------

export const SERVICE_PARAM = "tjeneste";

/** Lenken til Tjenester med verktoeyet valgt, f.eks. snarveiene paa /start. */
export function serviceHref(toolId: string): string {
  return `${SERVICES_PATH}?${SERVICE_PARAM}=${encodeURIComponent(toolId)}`;
}

/**
 * Verktoeyet i adressen, og kategorien det ligger i. Bare tjenester som er
 * slaatt paa: en skjult eller ukjent id gir null, og siden starter uten valg.
 */
export function toolFromParam(value: string | null): { categoryId: string; toolId: string } | null {
  if (value === null) return null;
  for (const c of expressCategories()) {
    const tool = c.items.find((t) => t.id === value);
    if (tool !== undefined) return { categoryId: c.id, toolId: tool.id };
  }
  return null;
}
