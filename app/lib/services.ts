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
 * Rene data og funksjoner uten import, saa modulen kan testes med node --test.
 */

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

export interface NavLink {
  href: string;
  label: string;
  className: string;
  /** Skillelinje foer lenken. */
  dividerBefore?: boolean;
}

const ALL_NAV_LINKS: NavLink[] = [
  { href: "/express", label: "⚡ Express", className: "hover:text-[#009183] transition-colors" },
  { href: STAGING_PATH, label: "🛋️ Staging", className: "hover:text-[#00ff83] transition-colors" },
  { href: "/video", label: "🎬 Video", className: "hover:text-purple-400 transition-colors" },
  { href: "/copywriter", label: "✍️ Copywriter", className: "..." },
  { href: "/orders", label: "📁 Orders", className: "hover:text-white transition-colors", dividerBefore: true },
  { href: "/history", label: "🕘 Historikk", className: "hover:text-white transition-colors" },
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
  icon: string;
  title: string;
  desc: string;
}

export interface Category {
  id: string;
  title: string;
  icon: string;
  items: Tool[];
}

// Fasit fra backendens service-enum. Beskrivelser gjenbrukt fra den gamle
// express-siden der de fantes (engelsk, ingen spesialtegn). Flyttet hit fra
// app/express/page.tsx (L0) saa filtreringen kan testes.
const CATEGORIES: Category[] = [
  {
    id: "fixit",
    title: "Fix-It Tools",
    icon: "🧹",
    items: [
      {
        id: "magic_cleanup",
        service: "magic_cleanup",
        kind: "simple",
        icon: "🧽",
        title: "Magic Cleanup",
        desc: "Auto-remove moving boxes, loose cables, and general clutter.",
      },
      {
        id: "privacy_blur",
        service: "privacy_blur",
        kind: "simple",
        icon: "🕵️",
        title: "Privacy Blur",
        desc: "Seamlessly blur faces, family photos, and license plates.",
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
    title: "Time Traveler",
    icon: "🍂",
    items: [
      {
        id: "klart_vaer",
        service: "scene_transform",
        presetId: "klart_vaer",
        kind: "scene",
        icon: "☀️",
        title: "Klart vær",
        desc: "Transform the scene to bright, clear daylight.",
      },
      {
        id: "skumring",
        service: "scene_transform",
        presetId: "skumring",
        kind: "scene",
        sceneGate: false,
        icon: "🌆",
        title: "Skumring",
        desc: "Transform the scene to a warm, inviting dusk.",
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
