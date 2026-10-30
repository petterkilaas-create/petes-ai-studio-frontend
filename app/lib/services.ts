/**
 * Hvilke tjenester og sider som er slaatt paa (TG-NEW-136, L0, Petter
 * 29.09/30.09). Skumring og Klart vaer (K3, Dag 47) har merket vei
 * (EU-ikonet). Magic Cleanup og Virtual Staging gir bare den umerkede
 * PNG-en, saa de er skjult for alle, ogsaa admin, til de er merket. Privacy
 * Blur regnes ikke som KI-endring.
 *
 * Slaa en tjeneste paa igjen ved aa endre EN linje i ENABLED. Koden for
 * tjenestene og sidene er beholdt. Backend har sin egen tillatelsesliste
 * (services/enabled.py, TG-NEW-138), som maa aapnes i samme slengen.
 *
 * Rene data og funksjoner (en type-import, og marketingAccess.ts uten egne
 * importer), saa modulen kan testes med node --test.
 */

import type { Capabilities, ImageTypeHint } from "./api";
import type { UiKey } from "./i18n";
import { START_PATH } from "./marketingAccess.ts";

export const ENABLED = {
  /** Aapnet i K3 (Dag 47), merket i G2. Nivaa 2: ingen bildetypevelger. */
  klart_vaer: true,
  magic_cleanup: false,
  virtual_stage: false,
  /** Proof-of-concept-siden /express-v2, ikke en tjeneste. */
  express_v2: false,
  privacy_blur: true,
  skumring: true,
  /** Digital styling (S2-f, S3-f): aapnet i S4 (Dag 51), sammen med backend. */
  digital_styling: true,
  /**
   * Aarstider (TG-NEW-271, Dag 57): paa fra start (Petter 22.05: ingen meglere
   * bruker tjenestene ennaa). Backend aapnes i dag57-aarstid-paa, som merges foerst.
   */
  aarstider: true,
  /**
   * Ordre per boligoppdrag (TG-NEW-277, FE-2): /ordrer og undersidene. Paa fra
   * FE-2 (Petter 29.10: «slaa alt paa»). Backend-flagget ASSIGNMENTS er paa (#270).
   */
  ordrer: true,
} as const;

/** Ukjent id gir av: en ny tjeneste maa legges inn over foer den vises. */
export function isServiceEnabled(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENABLED, id)
    ? ENABLED[id as keyof typeof ENABLED]
    : false;
}

// ---------------------------------------------------------------------------
// Annonsetekst (TG-NEW-281, T1): eget flagg med tre verdier
// ---------------------------------------------------------------------------

/**
 * Hvem som ser Annonsetekst i frontend: kortet paa Tjenester, snarveien paa
 * /start, lenken paa bildesiden og sidene under /annonsetekst.
 *
 * - "off": ingen. Kortet staar som «Kommer», og sidene er stengt.
 * - "admin": bare brukere med `view_all` fra /me (i dag bare admin; K §9.3
 *   punkt 6: redaktoeren er ikke med i v1).
 * - "on": alle innloggede.
 *
 * Slaas paa i T6 ved aa endre EN linje under, samtidig med backend-flagget
 * LISTING_TEXT (samme tre verdier, K §0). Egen konstant, ikke en linje i
 * ENABLED, fordi ENABLED bare er av/paa.
 */
export type ListingTextUi = "off" | "admin" | "on";

export const LISTING_TEXT_UI: ListingTextUi = "off";

/** /annonsetekst: velg ordre eller ny adresse. Tekstsiden er /annonsetekst/[ordreId]. */
export const LISTING_TEXT_PATH = "/annonsetekst";

/** "pending": flagget er "admin", og svaret fra /me er ikke kommet ennaa. */
export type ListingTextAccess = "yes" | "no" | "pending";

/**
 * Om brukeren slipper inn i Annonsetekst. Teksten gjelder en ordre, saa den
 * er ogsaa stengt naar ordrene er av. `caps` er svaret fra /me (null foer det
 * er kommet); feil fra /me gir NO_CAPABILITIES og dermed "no" for "admin".
 */
export function listingTextAccess(
  caps: Capabilities | null,
  flag: ListingTextUi = LISTING_TEXT_UI
): ListingTextAccess {
  if (flag === "off" || !isPageEnabled(ORDERS_PATH)) return "no";
  if (flag === "on") return "yes";
  if (caps === null) return "pending";
  return caps.viewAll ? "yes" : "no";
}

/** Bare "admin" trenger /me. Med "off" og "on" sendes ikke kallet. */
export function listingTextNeedsCapabilities(flag: ListingTextUi = LISTING_TEXT_UI): boolean {
  return flag === "admin" && isPageEnabled(ORDERS_PATH);
}

// ---------------------------------------------------------------------------
// Sider som styres av en tjeneste
// ---------------------------------------------------------------------------

/** Tjenester (TG-NEW-153): alle tjenestene samles her. /express sendes hit (next.config.ts). */
export const SERVICES_PATH = "/tjenester";
export const STAGING_PATH = "/staging";
export const EXPRESS_V2_PATH = "/express-v2";
/** Ordrene (FE-2). Undersidene sjekker denne stien, fordi isPageEnabled slaar opp eksakt sti. */
export const ORDERS_PATH = "/ordrer";

const PAGE_SERVICE: Record<string, string> = {
  [STAGING_PATH]: "virtual_stage",
  [EXPRESS_V2_PATH]: "express_v2",
  [ORDERS_PATH]: "ordrer",
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
export type NavId = "start" | "services" | "staging" | "orders" | "history";

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
  // FE-2: ved siden av Historikk, som blir staaende til det er besluttet om Ordrer erstatter den.
  { id: "orders", href: ORDERS_PATH },
  { id: "history", href: "/history" },
];

/** Lenkene i menyen. Lenker som ikke er tjenester, vises alltid. */
export function navLinks(): NavLink[] {
  return ALL_NAV_LINKS.filter((l) => isPageEnabled(l.href));
}

// ---------------------------------------------------------------------------
// Tjenestevalget paa Tjenester (heter fortsatt express* internt, valg B1)
// ---------------------------------------------------------------------------

// "simple"  = service alene (ingen params, backend-defaults gjelder).
// "scene"   = scene_transform med preset_id + scene-type-gate (TG-NEW-58).
// "styling" = Digital styling: egen bestilling med 1–3 stiler (S2-f, S3-f, POST /v1/orders/styling).
// "aarstid" = Aarstider: egen bestilling med kilden og 1–3 aarstider (TG-NEW-271, POST /v1/orders/aarstid).
// "page"    = egen side (`href`), ingen bestilling paa Tjenester: Annonsetekst (TG-NEW-281, T1).
export type ToolKind = "simple" | "scene" | "styling" | "aarstid" | "page";

export interface Tool {
  /** Id-en i ENABLED. Skiller Klart vaer fra skumring (samme service). */
  id: string;
  service: string;
  presetId?: string;
  kind: ToolKind;
  /**
   * Scene-type-velger + "Tving eksterioer" for scene-kort. Standard true;
   * false der backend bestemmer bildetypen selv (nivaa 2: skumring og
   * Klart vaer).
   */
  sceneGate?: boolean;
  /**
   * «Hvor er bildet tatt?» (TG-NEW-268): valgene backend godtar for tjenesten
   * (`Recipe.image_type_hints`). Mangler feltet, faar tjenesten ikke valget.
   */
  imageTypeHints?: readonly ImageTypeHint[];
  /** Siden kortet aapner (bare kind "page"). */
  href?: string;
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
        id: "skumring",
        service: "scene_transform",
        presetId: "skumring",
        kind: "scene",
        sceneGate: false,
        // Ikke Drone: Kveldsbilde kan ikke lages fra dronebilder ennaa (backend gir 400).
        imageTypeHints: ["interior", "exterior"],
        titleKey: "service.scene_transform",
        descKey: "express.tool.skumring.desc",
      },
      // Etter kveldsbildet (dag 45). Aapnet i K3 (Dag 47): nivaa 2, port 1
      // avgjoer bildetypen, saa ingen bildetypevelger og ingen skumringsvalg.
      {
        id: "klart_vaer",
        service: "scene_transform",
        presetId: "klart_vaer",
        kind: "scene",
        sceneGate: false,
        // Ikke Innendoers: Blaa himmel bytter bare himmelen ute (backend gir 400).
        imageTypeHints: ["exterior", "aerial"],
        titleKey: "express.tool.klart_vaer.title",
        descKey: "express.tool.klart_vaer.desc",
      },
      // Etter Blaa himmel (TG-NEW-271, Dag 57; «Bildestudio» paa markedssiden).
      // Én bestilling med 1–3 aarstider (kind "aarstid", ingen presetId); bildetypen
      // er alltid «Utendørs» og velges i AarstidChoicePicker, ikke i ImageTypeChoice.
      {
        id: "aarstider",
        service: "scene_transform",
        kind: "aarstid",
        titleKey: "express.tool.aarstider.title",
        descKey: "express.tool.aarstider.desc",
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
  // «Kommer»-kortene (dag 45, demo-porten): vises paa Tjenester, men kan
  // ikke bestilles. Video og Annonsetekst er ikke i ENABLED, saa
  // isServiceEnabled gir av; Digital styling styres av ENABLED.digital_styling.
  // Annonsetekst styres av LISTING_TEXT_UI (T1) og blir en lenke naar flagget slipper brukeren inn.
  {
    id: "furnishing",
    titleKey: "express.category.furnishing",
    items: [
      // Id-en er digital_styling, ikke virtual_stage (Petter 15.10): kortet
      // styres ikke av ENABLED.virtual_stage og /staging. S3-f: stilene
      // (14 fra stilene v3) under scene_transform, bestilt i ett kall (kind "styling", ingen presetId).
      {
        id: "digital_styling",
        service: "scene_transform",
        kind: "styling",
        titleKey: "service.virtual_stage",
        descKey: "express.tool.digital_styling.desc",
      },
      // «Kommer» (Petter 21.10): ikke med i foerste versjon av Digital
      // styling. Id-en er ikke i ENABLED, saa kortet kan ikke bestilles.
      {
        id: "same_furniture_angles",
        service: "same_furniture_angles",
        kind: "simple",
        titleKey: "express.tool.same_furniture_angles.title",
        descKey: "express.tool.same_furniture_angles.desc",
      },
    ],
  },
  {
    id: "more",
    titleKey: "express.category.more",
    items: [
      {
        id: "video",
        service: "video",
        kind: "simple",
        titleKey: "express.tool.video.title",
        descKey: "express.tool.video.desc",
      },
      // T1 (TG-NEW-281): het copywriter. Egen side, aldri en bestilling paa Tjenester.
      {
        id: "annonsetekst",
        service: "listing_text",
        kind: "page",
        href: LISTING_TEXT_PATH,
        titleKey: "express.tool.annonsetekst.title",
        descKey: "express.tool.annonsetekst.desc",
      },
    ],
  },
  // Skjul ansikter og skilt sist, i egen kategori (APP1, Petter 20.10): den
  // er tatt ut av forsiden og finnes bare i appen. Flyttet fra fixit uendret.
  {
    id: "privacy",
    titleKey: "express.category.privacy",
    items: [
      {
        id: "privacy_blur",
        service: "privacy_blur",
        kind: "simple",
        titleKey: "service.privacy_blur",
        descKey: "express.tool.privacy_blur.desc",
      },
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

/** Et kort paa Tjenester: orderable false gir «Kommer» og ingen klikk. */
export type VisibleTool = Tool & { orderable: boolean };

/**
 * Alle kategoriene og kortene paa Tjenester, ogsaa de som ikke kan bestilles
 * (dag 45, demo-porten). Hva som kan bestilles, styres fortsatt av ENABLED
 * via expressCategories, orderableTools og toolFromParam.
 */
export function visibleCategories(): (Omit<Category, "items"> & { items: VisibleTool[] })[] {
  return CATEGORIES.map((c) => ({
    ...c,
    items: c.items.map((tool) => ({ ...tool, orderable: isServiceEnabled(tool.id) })),
  }));
}

/** Tjenestene som kan bestilles, i samme rekkefoelge som paa Tjenester. */
export function orderableTools(): Tool[] {
  return expressCategories().flatMap((c) => c.items);
}

/** Kortene som er lenker til en egen side (kind "page"), bare naar Annonsetekst er aapen for brukeren. */
export function pageCards(listingText: boolean): VisibleTool[] {
  if (!listingText) return [];
  return visibleCategories()
    .flatMap((c) => c.items)
    .filter((tool) => tool.kind === "page");
}

/** «Kommer» paa Tjenester: det som ikke kan bestilles, uten kortene som er lenker. */
export function comingCards(listingText: boolean): VisibleTool[] {
  const links = new Set(pageCards(listingText).map((tool) => tool.id));
  return visibleCategories()
    .flatMap((c) => c.items)
    .filter((tool) => !tool.orderable && !links.has(tool.id));
}

/**
 * Snarveiene paa /start: tjenestene som kan bestilles (til Tjenester med
 * tjenesten valgt), og Annonsetekst til sin egen side naar flagget slipper
 * brukeren inn.
 */
export function serviceShortcuts(listingText: boolean): { tool: Tool; href: string }[] {
  return [
    ...orderableTools().map((tool) => ({ tool, href: serviceHref(tool.id) })),
    ...pageCards(listingText).map((tool) => ({ tool, href: tool.href ?? SERVICES_PATH })),
  ];
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
