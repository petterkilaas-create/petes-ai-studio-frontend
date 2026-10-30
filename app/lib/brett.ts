import type { AssignmentImage, AssignmentResult } from "./assignments.ts";
import {
  aarstidParams,
  aarstidSummary,
  EMPTY_AARSTID,
  MAX_SEASONS,
  SEASONS,
  seasonKey,
  SOURCE_SEASONS,
  targetsFor,
  type AarstidChoice,
} from "./aarstid.ts";
import {
  addToImages,
  BOARD_SERVICES,
  coverage,
  itemKey,
  removeFromImages,
  removeItem,
  replaceItem,
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
  MAX_ORDER_JOBS,
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

/**
 * Valgene i vinduet for en tjeneste (FE-3b; het panelet i FE-3). Samme
 * velgere og samme standard som paa Tjenester. `dusk` er null naar ingen
 * stemning er valgt (bildene har ulike valg, se sheetStart).
 */
export interface PanelState {
  dusk: DuskChoice | null;
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
    dusk: panel.dusk ?? DEFAULT_DUSK,
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
      if (panel.dusk === null) return null;
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
  if (service === "skumring") return panel.dusk === null ? t(locale, "board.missingDusk") : null;
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

// --- vinduet for valgene (FE-3b) ---------------------------------------------------

/**
 * Hva vinduet endrer: tjenesten paa de avkryssede bildene («Legg til…» og
 * «Endre…» i panelet), eller ett element (merkelappen paa bildekortet).
 */
export type SheetTarget =
  | { kind: "images"; service: BoardService; imageIds: readonly string[] }
  | { kind: "item"; service: BoardService; imageId: string; key: string };

/** «Legg til» naar ingen av bildene har tjenesten, ellers «Oppdater». */
export type SheetMode = "add" | "edit";

/**
 * Knappene nederst i vinduet: «Legg til» legger valgene paa alle bildene i
 * maalet (som panelet i FE-3), «Oppdater» bytter dem bare paa bildene som
 * har tjenesten.
 */
export type SheetAction = "add" | "update";

export interface SheetButton {
  action: SheetAction;
  text: string;
}

export interface SheetStart {
  mode: SheetMode;
  /** Valgene vinduet aapner med. */
  panel: PanelState;
  /** Bildene har ulike valg for tjenesten: ingenting er forhaandsvalgt. */
  mixed: boolean;
}

/** Bildene i maalet (ett for merkelappen). */
export function sheetImages(target: SheetTarget): readonly string[] {
  return target.kind === "item" ? [target.imageId] : target.imageIds;
}

/** Bildene blant `imageIds` som har tjenesten, i samme rekkefoelge. */
export function withService(items: readonly BoardItem[], imageIds: readonly string[], service: BoardService): string[] {
  return imageIds.filter((id) => items.some((it) => it.imageId === id && it.service === service));
}

/** Valgene for tjenesten uten noe valgt (standardene der det finnes en, som «La analysen avgjøre»). */
export function clearService(service: BoardService, panel: PanelState): PanelState {
  switch (service) {
    case "skumring":
      return { ...panel, dusk: null, duskImageType: "auto" };
    case "klart_vaer":
      return { ...panel, skyImageType: "auto" };
    case "styling":
      return { ...panel, styling: EMPTY_STYLING };
    case "aarstid":
      return { ...panel, aarstid: EMPTY_AARSTID };
    case "skjul_ansikter":
      return panel;
  }
}

/** Valget paa ett element som tekst, med oenskene (de skal ikke overskrives i det stille). */
function choiceSignature(item: BoardItem): string {
  const fields = item.fields ?? {};
  const sorted = Object.keys(fields)
    .sort()
    .map((k) => [k, fields[k]]);
  return JSON.stringify([item.option, item.sourceSeason, sorted]);
}

/** Alle valgene for tjenesten paa ett bilde, uavhengig av rekkefoelgen. */
function imageSignature(items: readonly BoardItem[], imageId: string, service: BoardService): string {
  return items
    .filter((it) => it.imageId === imageId && it.service === service)
    .map(choiceSignature)
    .sort()
    .join("|");
}

/**
 * Vinduet med valgene fra elementene paa ett bilde, eller null naar vinduet
 * ikke kan vise dem (to kveldsbilder, stiler med ulik romtype, flere enn
 * tillatt). Styling og aarstid: ett element per stil eller aarstid, med
 * samme felt ellers.
 */
export function panelFromItems(items: readonly BoardItem[], panel: PanelState): PanelState | null {
  if (items.length === 0) return null;
  const [first] = items;
  const base = panelFromItem(first, panel);
  if (first.service !== "styling" && first.service !== "aarstid") return items.length === 1 ? base : null;
  const rest = (it: BoardItem) => JSON.stringify([it.sourceSeason, choiceSignature({ ...it, option: null, sourceSeason: null })]);
  if (items.some((it) => it.service !== first.service || rest(it) !== rest(first))) return null;
  if (first.service === "styling") {
    const styles = STYLING_STYLES.filter((s) => items.some((it) => it.option === s));
    if (styles.length !== items.length || styles.length > MAX_ORDER_JOBS) return null;
    return { ...base, styling: { ...base.styling, styles } };
  }
  const allowed = targetsFor(base.aarstid.source);
  const seasons = SEASONS.filter((s) => items.some((it) => it.option === s));
  if (seasons.length !== items.length || seasons.length > MAX_SEASONS || seasons.some((s) => !allowed.includes(s))) {
    return null;
  }
  return { ...base, aarstid: { ...base.aarstid, seasons } };
}

/**
 * Hva vinduet aapner med. Ingen av bildene har tjenesten: «Legg til», med
 * det som ble valgt sist (`memory`) og det som gjelder bildet nullstilt.
 * Har noen av dem den: «Oppdater», med valgene fra bildene naar de er like,
 * ellers ingenting forhaandsvalgt (`mixed`). Merkelappen: valgene fra elementet.
 */
export function sheetStart(items: readonly BoardItem[], target: SheetTarget, memory: PanelState): SheetStart {
  const { service } = target;
  const empty = clearService(service, memory);
  if (target.kind === "item") {
    const item = items.find((it) => itemKey(it) === target.key);
    return { mode: "edit", panel: item === undefined ? empty : panelFromItem(item, empty), mixed: false };
  }
  const having = withService(items, target.imageIds, service);
  if (having.length === 0) return { mode: "add", panel: panelForNewSelection(memory), mixed: false };
  const signatures = new Set(having.map((id) => imageSignature(items, id, service)));
  const panel =
    signatures.size === 1
      ? panelFromItems(
          items.filter((it) => it.imageId === having[0] && it.service === service),
          empty
        )
      : null;
  return panel === null ? { mode: "edit", panel: empty, mixed: true } : { mode: "edit", panel, mixed: false };
}

/**
 * Brettet etter en knapp i vinduet, eller null naar valget ikke er komplett.
 * «Legg til» legger valgene paa alle bildene i maalet, uten dubletter (de
 * samme elementene som panelet i FE-3, addChoices). «Oppdater» bytter
 * tjenesten med valgene bare paa bildene som har den; de andre roeres ikke.
 * Merkelappen bytter bare sitt element (replaceItem).
 */
export function applySheet(
  items: readonly BoardItem[],
  target: SheetTarget,
  action: SheetAction,
  panel: PanelState
): BoardItem[] | null {
  const choices = panelChoices(target.service, panel);
  if (choices === null) return null;
  if (target.kind === "item") return replaceItem(items, target.key, choices);
  if (action === "add") return addChoices(items, target.imageIds, choices);
  const having = withService(items, target.imageIds, target.service);
  return addChoices(removeFromImages(items, having, target.service), having, choices);
}

/** «Fjern» i vinduet: tjenesten av bildene i maalet, eller bare elementet for merkelappen. */
export function removeSheet(items: readonly BoardItem[], target: SheetTarget): BoardItem[] {
  if (target.kind === "item") return removeItem(items, target.key);
  return removeFromImages(items, target.imageIds, target.service);
}

/**
 * Knappene nederst i vinduet. Ingen har tjenesten: «Legg til på 2 bilder».
 * Alle har den: «Oppdater 2 bilder». Noen har den: «Oppdater de 2 som har
 * den» og «Legg til på alle 3» (Petter 30.10). `total` er bildene i maalet,
 * `has` de som har tjenesten.
 */
export function sheetButtons(locale: Locale, mode: SheetMode, total: number, has: number): SheetButton[] {
  if (mode === "add") {
    return [{ action: "add", text: total === 1 ? t(locale, "board.addOne") : t(locale, "board.addMany", { n: total }) }];
  }
  if (has >= total) {
    return [{ action: "update", text: total === 1 ? t(locale, "board.updateOne") : t(locale, "board.updateMany", { n: total }) }];
  }
  return [
    { action: "update", text: has === 1 ? t(locale, "board.updateSomeOne") : t(locale, "board.updateSome", { n: has }) },
    { action: "add", text: t(locale, "board.addAll", { n: total }) },
  ];
}

/** Den dempede knappen «Fjern fra de 2 bildene»; null naar ingen av bildene har tjenesten. */
export function removeText(locale: Locale, total: number, has: number): string | null {
  if (has === 0) return null;
  if (has === 1) return total === 1 ? t(locale, "board.removeOne") : t(locale, "board.removeSomeOne");
  return t(locale, "board.removeMany", { n: has });
}

// --- panelet (FE-3b) ------------------------------------------------------------------

export interface ServiceRow {
  coverage: Coverage;
  /** Hvor mange av de avkryssede som har tjenesten. */
  has: number;
  /** «Ikke lagt til», «På 1 av 2», «På alle 2»; null uten avkryssede bilder. */
  status: string | null;
  /** Knappen: «Legg til…» eller «Endre…». */
  action: SheetMode;
  /** «Ulike stiler nå: Japandi, Sekelskifte», eller null naar valgene er like. */
  mixed: string | null;
}

/** Raden for tjenesten i panelet, for de avkryssede bildene. */
export function serviceRow(
  locale: Locale,
  items: readonly BoardItem[],
  selected: readonly string[],
  service: BoardService
): ServiceRow {
  const state = coverage(items, selected, service);
  const has = withService(items, selected, service).length;
  return {
    coverage: state,
    has,
    status: selected.length === 0 ? null : coverageText(locale, state, has, selected.length),
    action: has === 0 ? "add" : "edit",
    mixed: mixedText(locale, items, selected, service),
  };
}

const MIXED_KEY: Readonly<Partial<Record<BoardService, UiKey>>> = {
  skumring: "board.mixed.skumring",
  styling: "board.mixed.styling",
  aarstid: "board.mixed.aarstid",
};

/**
 * Har bildene som har tjenesten ulike valg for den: hvilke («Ulike stiler nå:
 * Japandi, Sekelskifte»), eller bare at de er ulike naar forskjellen er noe
 * annet (romtype, bildetype, oensker). Null naar valgene er like.
 */
export function mixedText(
  locale: Locale,
  items: readonly BoardItem[],
  imageIds: readonly string[],
  service: BoardService
): string | null {
  const having = withService(items, imageIds, service);
  const signatures = new Set(having.map((id) => imageSignature(items, id, service)));
  if (signatures.size < 2) return null;
  // Valgene som merkelappene viser (stilene, stemningen), per bilde og samlet.
  const perImage = new Set<string>();
  const details: string[] = [];
  for (const id of having) {
    const mine: string[] = [];
    for (const it of items) {
      if (it.service !== service || it.imageId !== id) continue;
      const detail = itemDetail(locale, it);
      if (detail === null) continue;
      mine.push(detail);
      if (!details.includes(detail)) details.push(detail);
    }
    perImage.add([...mine].sort().join("|"));
  }
  const key = MIXED_KEY[service];
  // Samme stiler paa alle: forskjellen er noe annet (romtype, bildetype, oensker).
  return key !== undefined && perImage.size > 1 ? t(locale, key, { list: details.join(", ") }) : t(locale, "board.mixed.other");
}

// --- aarstider er for utebilder (FE-3b) ---------------------------------------------------

/** Ord i rom-navnet som tyder paa et innerom. Hele ordet, eller slutten av et sammensatt ord. */
const INDOOR_WORDS = ["inne", "innendørs", "gang", "hall", "entré", "entre", "bod", "wc", "toalett", "loft", "kjeller", "vindfang"];
const INDOOR_ENDINGS = ["stue", "kjøkken", "rom", "bad", "kontor", "living", "kitchen", "bedroom", "bathroom", "hallway", "office", "room"];

/**
 * Tyder rom-navnet paa at bildet er tatt inne («Stue», «Hovedsoverom»,
 * «Gang»)? Ord som begynner paa «ute» («Uterom», «Uteplass») teller ikke.
 * Et anslag: det gir bare en advarsel, backend avgjoer.
 */
export function looksIndoor(room: string | null): boolean {
  if (room === null) return false;
  const words = room.toLowerCase().split(/[^a-zæøåé]+/).filter((w) => w.length > 0 && !w.startsWith("ute"));
  return words.some((w) => INDOOR_WORDS.includes(w) || INDOOR_ENDINGS.some((end) => w.endsWith(end)));
}

/**
 * Bildene i maalet som ser ut til aa vaere tatt inne: rom-navnet tyder paa det,
 * eller megleren har valgt «Innendørs» for en annen tjeneste paa bildet.
 */
export function indoorImages(
  images: readonly AssignmentImage[],
  items: readonly BoardItem[],
  imageIds: readonly string[]
): AssignmentImage[] {
  const ids = new Set(imageIds);
  return images.filter(
    (img) =>
      ids.has(img.id) &&
      (looksIndoor(img.room) || items.some((it) => it.imageId === img.id && it.fields?.image_type_hint === "interior"))
  );
}

// --- navnene ---------------------------------------------------------------------

/**
 * Navnet paa et element: tjenesten og valget («Kveldsbilde · Blå time»,
 * «Digital styling · Japandi», «Årstider · Vinter»).
 */
export function itemLabel(locale: Locale, item: BoardItem): string {
  return withDetail(t(locale, serviceNameKey(item.service)), itemDetail(locale, item));
}

/**
 * Merkelappen paa bildekortet (FE-3b, skissen): det korte navnet og valget
 * («Kveldsbilde · Varm skumring», «Styling · Japandi», «Årstid · Vinter»).
 */
export function badgeLabel(locale: Locale, item: BoardItem): string {
  return withDetail(t(locale, `board.badge.${item.service}`), itemDetail(locale, item));
}

function itemDetail(locale: Locale, item: BoardItem): string | null {
  return choiceText(locale, item.service, item.option, fieldString(item, "dusk_style"));
}

function withDetail(name: string, detail: string | null): string {
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
