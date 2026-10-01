/**
 * Hvilke tjenester og sider som er slaatt paa (TG-NEW-136, L0, Petter
 * 29.09/30.09). Bare skumring har merket vei (EU-ikonet). Klart vaer, Magic
 * Cleanup og Virtual Staging gir bare den umerkede PNG-en, saa de er skjult
 * for alle, ogsaa admin, til de er merket. Privacy Blur regnes ikke som
 * KI-endring.
 *
 * Slaa en tjeneste paa igjen ved aa endre EN linje i ENABLED. Koden for
 * tjenestene og sidene er beholdt. Backend er uendret og sperrer ingenting.
 *
 * Rene data og funksjoner (bare en type-import), saa modulen kan testes med
 * node --test.
 */

import type { UiKey } from "./i18n";

export const ENABLED = {
  klart_vaer: false,
  magic_cleanup: false,
  virtual_stage: false,
  /** Proof-of-concept-siden /express-v2, ikke en tjeneste. */
  express_v2: false,
  privacy_blur: true,
  skumring: true,
  /**
   * Gamle sider uten tjeneste bak (dag 33, L0b): backend-rutene de kaller
   * (routers/jobs.py, routers/media.py) er ikke montert.
   */
  video: false,
  copywriter: false,
  orders: false,
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

export const STAGING_PATH = "/staging";
export const EXPRESS_V2_PATH = "/express-v2";
export const VIDEO_PATH = "/video";
export const COPYWRITER_PATH = "/copywriter";
export const ORDERS_PATH = "/orders";

const PAGE_SERVICE: Record<string, string> = {
  [STAGING_PATH]: "virtual_stage",
  [EXPRESS_V2_PATH]: "express_v2",
  [VIDEO_PATH]: "video",
  [COPYWRITER_PATH]: "copywriter",
  [ORDERS_PATH]: "orders",
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
export type NavId = "express" | "staging" | "video" | "copywriter" | "orders" | "history";

export interface NavLink {
  id: NavId;
  href: string;
  /** Skillelinje foer lenken. */
  dividerBefore?: boolean;
}

// Tekst, ikon og farger ligger i AppNav og ordlista (D1), ikke her.
const ALL_NAV_LINKS: NavLink[] = [
  { id: "express", href: "/express" },
  { id: "staging", href: STAGING_PATH },
  { id: "video", href: VIDEO_PATH },
  { id: "copywriter", href: COPYWRITER_PATH },
  { id: "orders", href: ORDERS_PATH, dividerBefore: true },
  { id: "history", href: "/history" },
];

/** Lenkene i menyen. Lenker som ikke er tjenester, vises alltid. */
export function navLinks(): NavLink[] {
  return ALL_NAV_LINKS.filter((l) => isPageEnabled(l.href));
}

// ---------------------------------------------------------------------------
// Tjenestevalget i Express
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
  /** Tekstene staar i ordlista (D1c, brief §7); ikonet i express/page.tsx. */
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
];

/** Kategoriene i Express med bare paaslaatte verktoey. Tomme kategorier skjules. */
export function expressCategories(): Category[] {
  return CATEGORIES.map((c) => ({
    ...c,
    items: c.items.filter((tool) => isServiceEnabled(tool.id)),
  })).filter((c) => c.items.length > 0);
}
