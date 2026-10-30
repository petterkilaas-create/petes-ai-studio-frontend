import type { AssignmentImage, AssignmentResult } from "./assignments.ts";
import { aarstidParams, aarstidSummary, EMPTY_AARSTID, SEASONS, seasonKey, SOURCE_SEASONS, type AarstidChoice } from "./aarstid.ts";
import {
  addToImages,
  BOARD_SERVICES,
  type BoardChoice,
  type BoardItem,
  type BoardService,
  type Coverage,
} from "./board.ts";
import { DEFAULT_DUSK, duskParams, isDuskStyle, isValidChoice, type DuskChoice, type DuskSky } from "./dusk.ts";
import { codeText, t, type Locale, type UiKey } from "./i18n/index.ts";
import { imageTypeChoices, imageTypeParams, type ImageTypeChoice } from "./imageType.ts";
import { isServiceEnabled, orderableTools, type Tool } from "./services.ts";
import {
  DECOR_LEVELS,
  EMPTY_STYLING,
  FURNISH_AS_CHOICES,
  STYLING_STYLES,
  stylingParams,
  stylingSummary,
  styleText,
  type StylingChoice,
} from "./styling.ts";

/**
 * Reglene for bildebrettet og oppsummeringen (TG-NEW-277, FE-3): hvilke
 * tjenester panelet viser, valgene i panelet oversatt til elementer med
 * feltene i K 2.7, navnene paa elementene og resultatene, avkrysningen av
 * bilder og tallene paa oppsummeringen. Rene funksjoner uten React og uten
 * api.ts, saa de testes med node --test. Elementene og utkastet ligger i
 * board.ts, sendingen i orderStart.ts.
 */

/** Id-en i ENABLED (services.ts) for hver tjeneste i ordren. */
const TOOL_ID: Readonly<Record<BoardService, string>> = {
  skumring: "skumring",
  styling: "digital_styling",
  aarstid: "aarstider",
  klart_vaer: "klart_vaer",
  skjul_ansikter: "privacy_blur",
};

/** Tjenestene panelet viser: de som er slaatt paa, i rekkefoelgen fra skissen. */
export function boardServices(): BoardService[] {
  return BOARD_SERVICES.filter((s) => isServiceEnabled(TOOL_ID[s]));
}

/** Navnet paa tjenesten og én linje om hva den gjoer. */
export function serviceNameKey(service: BoardService): UiKey {
  return `board.service.${service}`;
}

export function serviceDescKey(service: BoardService): UiKey {
  return `board.serviceDesc.${service}`;
}

/** Tjenesten i Tjenester (bildetypene den godtar), eller null naar den er av. */
function toolFor(service: BoardService): Tool | null {
  return orderableTools().find((tool) => tool.id === TOOL_ID[service]) ?? null;
}

/** «Hvor er bildet tatt?» for skumring og klart vaer, som paa Tjenester. Andre: ingen valg. */
export function boardImageTypeChoices(service: BoardService): ImageTypeChoice[] {
  return service === "skumring" || service === "klart_vaer" ? imageTypeChoices(toolFor(service)) : [];
}

// --- panelet -------------------------------------------------------------------

/** Valgene i panelet. Samme velgere og samme standard som paa Tjenester. */
export interface PanelState {
  dusk: DuskChoice;
  /** «Hvor er bildet tatt?» for skumring. */
  duskImageType: ImageTypeChoice;
  /** «Hvor er bildet tatt?» for klart vaer. */
  skyImageType: ImageTypeChoice;
  styling: StylingChoice;
  aarstid: AarstidChoice;
}

export const EMPTY_PANEL: PanelState = {
  dusk: DEFAULT_DUSK,
  duskImageType: "auto",
  skyImageType: "auto",
  styling: EMPTY_STYLING,
  aarstid: EMPTY_AARSTID,
};

/**
 * Nye bilder krysset av: det som gjelder bildet (tomt rom, aarstiden det er
 * tatt i og hvor det er tatt), maa velges paa nytt. Stilene og stemningen staar.
 */
export function panelForNewSelection(panel: PanelState): PanelState {
  return {
    ...panel,
    duskImageType: "auto",
    skyImageType: "auto",
    styling: { ...panel.styling, roomEmpty: false },
    aarstid: EMPTY_AARSTID,
  };
}

/**
 * Valgene i panelet som elementer for ett bilde (K 2.7), eller null naar
 * valget ikke er komplett (da er «Legg til» av). Styling og aarstid gir ett
 * element per stil eller aarstid (hver blir et eget resultat). Feltene er de
 * samme som dagens bestilling paa Tjenester sender (duskParams, stylingParams,
 * aarstidParams, imageTypeParams).
 */
export function panelChoices(service: BoardService, panel: PanelState): BoardChoice[] | null {
  switch (service) {
    case "skumring":
      return [
        {
          service,
          fields: {
            ...duskParams("scene_transform", "skumring", panel.dusk),
            ...imageTypeParams(toolFor(service), panel.duskImageType),
          },
        },
      ];
    case "klart_vaer":
      return [{ service, fields: { ...imageTypeParams(toolFor(service), panel.skyImageType) } }];
    case "styling": {
      const params = stylingParams(panel.styling);
      if (params === null) return null;
      const { styles, ...rest } = params;
      return styles.map((option) => ({ service, option, fields: { ...rest } }));
    }
    case "aarstid": {
      const params = aarstidParams(panel.aarstid);
      if (params === null) return null;
      return params.seasons.map((option) => ({
        service,
        option,
        sourceSeason: params.source_season,
        fields: { image_type_hint: params.image_type_hint },
      }));
    }
    case "skjul_ansikter":
      return [{ service }];
  }
}

/** Hvorfor «Legg til» er av (det foerste som mangler), eller null. */
export function panelMissing(locale: Locale, service: BoardService, panel: PanelState): string | null {
  if (service === "styling") return stylingSummary(locale, panel.styling).missing;
  if (service === "aarstid") return aarstidSummary(locale, panel.aarstid).missing;
  return null;
}

/** Legg valgene paa de avkryssede bildene (uten dubletter, board.ts). */
export function addChoices(items: readonly BoardItem[], imageIds: readonly string[], choices: readonly BoardChoice[]): BoardItem[] {
  let out = [...items];
  for (const choice of choices) out = addToImages(out, imageIds, choice);
  return out;
}

function fieldString(item: BoardItem, name: string): string | null {
  const value = item.fields?.[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function imageTypeOf(item: BoardItem): ImageTypeChoice {
  const hint = fieldString(item, "image_type_hint");
  return hint === "interior" || hint === "exterior" || hint === "aerial" ? hint : "auto";
}

/**
 * Panelet med valgene fra et element («Endre» paa bildet). Det som ikke kan
 * leses (ukjent stil, gammelt utkast), blir staaende som foer.
 */
export function panelFromItem(item: BoardItem, panel: PanelState): PanelState {
  switch (item.service) {
    case "skumring": {
      const style = fieldString(item, "dusk_style");
      const sky = fieldString(item, "dusk_sky");
      const dusk =
        style !== null && sky !== null && isDuskStyle(style) && isValidChoice(style, sky)
          ? { style, sky: sky as DuskSky }
          : panel.dusk;
      return { ...panel, dusk, duskImageType: imageTypeOf(item) };
    }
    case "klart_vaer":
      return { ...panel, skyImageType: imageTypeOf(item) };
    case "styling": {
      const room = fieldString(item, "furnish_as");
      const furnishAs = FURNISH_AS_CHOICES.find((r) => r === room) ?? null;
      const decorRaw = item.fields?.decor_level;
      const decor = DECOR_LEVELS.find((d) => d === decorRaw) ?? null;
      const style = STYLING_STYLES.find((s) => s === item.option);
      return {
        ...panel,
        styling: {
          furnishAs,
          roomEmpty: item.fields?.room_empty_confirmed === true,
          styles: style === undefined ? [] : [style],
          decor,
          wishes: fieldString(item, "wishes") ?? "",
        },
      };
    }
    case "aarstid": {
      const source = SOURCE_SEASONS.find((s) => s === item.sourceSeason) ?? null;
      const season = SEASONS.find((s) => s === item.option);
      return { ...panel, aarstid: { source, seasons: season === undefined ? [] : [season] } };
    }
    case "skjul_ansikter":
      return panel;
  }
}

/** Teksten paa statusmerket i panelet: ingen, noen eller alle av de avkryssede har tjenesten. */
export function coverageText(locale: Locale, state: Coverage, has: number, of: number): string {
  if (state === "none") return t(locale, "board.coverage.none");
  if (state === "some") return t(locale, "board.coverage.some", { n: has, of });
  return of === 1 ? t(locale, "board.coverage.one") : t(locale, "board.coverage.all", { n: of });
}

/** Knappen «Legg til paa …» etter hvor mange som er krysset av og hvor mange som har tjenesten. */
export function addButtonText(locale: Locale, selected: number, has: number): string {
  if (selected === 1) return t(locale, "board.addOne");
  const rest = selected - has;
  if (has > 0 && rest > 0) return t(locale, "board.addRest", { n: rest });
  return t(locale, "board.addMany", { n: selected });
}

// --- navnene ---------------------------------------------------------------------

/**
 * Navnet paa et element: tjenesten og valget («Kveldsbilde · Blå time»,
 * «Digital styling · Japandi», «Årstider · Vinter»).
 */
export function itemLabel(locale: Locale, item: BoardItem): string {
  const name = t(locale, serviceNameKey(item.service));
  const detail = choiceText(locale, item.service, item.option, fieldString(item, "dusk_style"));
  return detail === null ? name : `${name} · ${detail}`;
}

function choiceText(locale: Locale, service: string | null, option: string | null, duskStyle: string | null): string | null {
  if (service === "skumring" && duskStyle !== null) return codeText(locale, "duskStyle", duskStyle);
  if (service === "styling") return styleText(locale, option);
  if (service === "aarstid") {
    const season = SEASONS.find((s) => s === option);
    return season === undefined ? null : t(locale, seasonKey(season));
  }
  return null;
}

function isBoardService(value: string | null): value is BoardService {
  return value !== null && (BOARD_SERVICES as readonly string[]).includes(value);
}

/**
 * Navnet paa et resultat fra backend (K 2.3): tjenesten fra `order_service`
 * i ordlista (backend sender `service_label` paa norsk), ellers
 * `service_label`, og valget (`option`: stilen eller aarstiden).
 */
export function resultLabel(locale: Locale, result: AssignmentResult): string {
  const service = isBoardService(result.orderService)
    ? result.orderService
    : result.service === "privacy_blur"
      ? "skjul_ansikter"
      : null;
  const name =
    service !== null ? t(locale, serviceNameKey(service)) : (result.serviceLabel ?? t(locale, "board.service.unknown"));
  const detail = choiceText(locale, service, result.option, null);
  return detail === null ? name : `${name} · ${detail}`;
}

// --- avkrysningen ------------------------------------------------------------------

/** Kryss av eller fjern krysset paa ett bilde. */
export function toggleSelected(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

/**
 * Shift-klikk: alle bildene mellom forrige klikk (`anchor`) og dette krysses
 * av, i rekkefoelgen paa brettet. Uten anker: som et vanlig klikk.
 */
export function selectRange(order: readonly string[], selected: readonly string[], anchor: string | null, id: string): string[] {
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (from < 0 || to < 0) return toggleSelected(selected, id);
  const [a, b] = from <= to ? [from, to] : [to, from];
  const range = order.slice(a, b + 1);
  const out = [...selected];
  for (const r of range) if (!out.includes(r)) out.push(r);
  return out;
}

/** «2 bilder krysset av», til skjermleseren og overskriften i panelet. */
export function selectedText(locale: Locale, n: number): string {
  if (n === 0) return t(locale, "board.selectedNone");
  return n === 1 ? t(locale, "board.selectedOne") : t(locale, "board.selectedMany", { n });
}

/** Navnet paa bildet: «3. Stue», eller filnavnet naar rommet mangler. */
export function imageName(image: AssignmentImage, number: number): string {
  return `${number}. ${image.room ?? image.fileName}`;
}

// --- oppsummeringen ------------------------------------------------------------------

export interface BoardTotals {
  images: number;
  /** Elementer som sendes (hvert blir et resultat). */
  results: number;
  perService: Record<BoardService, number>;
  /** Bilder uten nye elementer og uten resultater fra foer: leveres bare som original. */
  originalOnly: number;
  /** Elementer som trekker av kvoten (alt unntatt Skjul ansikter). */
  quotaItems: number;
}

export function boardTotals(images: readonly AssignmentImage[], items: readonly BoardItem[]): BoardTotals {
  const perService = Object.fromEntries(BOARD_SERVICES.map((s) => [s, 0])) as Record<BoardService, number>;
  const withItems = new Set<string>();
  let quotaItems = 0;
  for (const it of items) {
    perService[it.service] += 1;
    withItems.add(it.imageId);
    if (it.service !== "skjul_ansikter") quotaItems += 1;
  }
  const originalOnly = images.filter((img) => !withItems.has(img.id) && activeResults(img).length === 0).length;
  return { images: images.length, results: items.length, perService, originalOnly, quotaItems };
}

/** Linja under brettet: «8 originalbilder · 9 bearbeidinger · 1 leveres bare som original». */
export function totalsText(locale: Locale, totals: BoardTotals): string {
  return [
    t(locale, "board.totals.images", { n: totals.images }),
    t(locale, totals.results === 1 ? "board.totals.resultsOne" : "board.totals.results", { n: totals.results }),
    t(locale, "board.totals.originalOnly", { n: totals.originalOnly }),
  ].join(" · ");
}

/** Resultatene paa bildet fra foer som fortsatt gjelder (ikke «Ikke brukt» og ikke feilet). */
export function activeResults(image: AssignmentImage): AssignmentResult[] {
  return image.results.filter((r) => r.displayStatus !== "not_used" && r.displayStatus !== "failed");
}

/**
 * Kvoten foer start (GET /v1/quota): ubegrenset (admin og redaktoer), ukjent,
 * eller hvor mange som er igjen og om bestillingen gaar over.
 */
export type QuotaPlan =
  | { kind: "unknown" }
  | { kind: "unlimited" }
  | { kind: "limited"; need: number; remaining: number; limit: number; over: number };

export function quotaPlan(
  quota: { limited: false } | { limited: true; remaining: number; limit: number } | null,
  need: number
): QuotaPlan {
  if (quota === null) return { kind: "unknown" };
  if (!quota.limited) return { kind: "unlimited" };
  return { kind: "limited", need, remaining: quota.remaining, limit: quota.limit, over: Math.max(0, need - quota.remaining) };
}

/** Elementene sortert per bilde i rekkefoelgen paa brettet (oppsummeringen «per bilde»). */
export function itemsByImage(
  images: readonly AssignmentImage[],
  items: readonly BoardItem[]
): { image: AssignmentImage; number: number; items: BoardItem[] }[] {
  return images.map((image, i) => ({ image, number: i + 1, items: items.filter((it) => it.imageId === image.id) }));
}
