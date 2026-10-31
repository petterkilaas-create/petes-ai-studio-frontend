import { formatDate } from "./dates.ts";
import { codeText, t, type Locale, type UiKey } from "./i18n/index.ts";
import type { AssignmentRequest } from "./assignments.ts";
import {
  CHANNELS,
  countWords,
  getListingText,
  getListingTextDocumentUrl,
  LENGTH_TARGETS,
  ListingTextError,
  listingTextErrorCode,
  parseFieldPath,
  splitWorthKnowing,
  type Channel,
  type Fact,
  type LengthPath,
  type ListingText,
  type ListingTextBasis,
  type ListingTextChannels,
  type ListingTextDocument,
  type ListingTextIssue,
  type ListingTextStatus,
  type ParagraphCheck,
  type TextItem,
} from "./listingText.ts";

/**
 * Visningen av tekstpakken (TG-NEW-281, T3): feltnavn, lengdene, avvikene per
 * felt, kildene, grunnlaget og «Åpne PDF». Ren modul uten React, som
 * listingTextOrder.ts. All tekst fra pakken vises som den er (ren tekst);
 * tekstene rundt kommer fra ordlista.
 *
 * Frontend regner ikke ut om et felt er utenfor maalet: det avgjoer backend
 * med avvikene `length_outside_target` og `headline_too_long` (`outsideTarget`).
 * Hovedteksten maales uten «Verdt å vite» (`measuredBody` i listingText.ts),
 * og maalet staar som én tekst i ordlista.
 */

// --- kanalene og feltnavnene -------------------------------------------------

const CHANNEL_KEYS: Readonly<Record<Channel, UiKey>> = {
  finn: "listingText.channel.finn",
  social: "listingText.channel.social",
  email: "listingText.channel.email",
};

/** Kanalene som finnes i pakken, i fast rekkefoelge (FINN, SoMe, E-post). */
export function presentChannels(channels: ListingTextChannels): Channel[] {
  return CHANNELS.filter((c) => channels[c] !== null);
}

export function channelName(locale: Locale, channel: Channel): string {
  return t(locale, CHANNEL_KEYS[channel]);
}

/** Feltnavnet («Ingress») for `<kanal>.<felt>`. Ukjent felt gir den generiske teksten. */
export function fieldName(locale: Locale, field: string): string {
  return codeText(locale, "listingTextField", field);
}

/** Id-en til elementet for en feltsti (`finn.body.p3` -> `lt-field-finn-body-p3`). */
export function fieldAnchorId(path: string): string {
  return `lt-field-${path.replace(/[^A-Za-z0-9]/g, "-")}`;
}

export interface FieldRef {
  /** «FINN · ingress», «FINN · hovedtekst, avsnitt 3». */
  text: string;
  /** Kanalen og elementet aa rulle til, eller null naar feltet ikke finnes i pakken. */
  channel: Channel | null;
  anchor: string | null;
}

/**
 * Feltet et avvik gjelder, med norske navn. Et avsnitt eller hoeydepunkt faar
 * nummeret sitt i lista. Ukjent sti, eller et felt som ikke finnes i pakken,
 * gir tekst uten maal (ingen lenke).
 */
export function fieldRef(locale: Locale, path: string, channels: ListingTextChannels | null): FieldRef {
  const fp = parseFieldPath(path);
  if (fp === null) return { text: codeText(locale, "listingTextField", path), channel: null, anchor: null };
  const base = `${fp.channel}.${fp.field}`;
  const name = fieldName(locale, base).toLocaleLowerCase(locale);
  const channel = channels?.[fp.channel] ?? null;
  let field = name;
  let found = channel !== null && fieldExists(channels as ListingTextChannels, fp.channel, fp.field);
  if (fp.itemId !== null && channel !== null) {
    const items = itemsOf(channels as ListingTextChannels, fp.channel, fp.field);
    const index = items.findIndex((item) => item.id === fp.itemId);
    if (index >= 0) {
      const key = fp.field === "body" ? "listingText.field.paragraph" : "listingText.field.highlight";
      field = t(locale, key, { field: name, n: index + 1 });
    } else {
      found = false;
    }
  }
  return {
    text: t(locale, "listingText.field.ref", { channel: channelName(locale, fp.channel), field }),
    channel: found ? fp.channel : null,
    anchor: found ? fieldAnchorId(path) : null,
  };
}

function channelRecord(channels: ListingTextChannels, channel: Channel): Record<string, unknown> | null {
  const value = channels[channel];
  return value === null ? null : (value as unknown as Record<string, unknown>);
}

function typedName(field: string): string {
  return field.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function fieldExists(channels: ListingTextChannels, channel: Channel, field: string): boolean {
  const rec = channelRecord(channels, channel);
  const value = rec?.[typedName(field)];
  return value !== null && value !== undefined;
}

function itemsOf(channels: ListingTextChannels, channel: Channel, field: string): TextItem[] {
  const value = channelRecord(channels, channel)?.[typedName(field)];
  return Array.isArray(value) ? (value as TextItem[]) : [];
}

// --- avvikene ----------------------------------------------------------------

/**
 * «2 vesentlige avvik, 3 til orientering». Bare delene som finnes; uten
 * avvik «Ingen avvik.».
 */
export function issueCountText(locale: Locale, issues: readonly ListingTextIssue[]): string {
  const material = issues.filter((i) => i.severity === "material").length;
  const info = issues.length - material;
  const parts: string[] = [];
  if (material > 0) {
    parts.push(
      material === 1 ? t(locale, "listingText.issues.materialOne") : t(locale, "listingText.issues.materialMany", { n: material })
    );
  }
  if (info > 0) parts.push(t(locale, "listingText.issues.info", { n: info }));
  return parts.length === 0 ? t(locale, "listingText.issues.none") : parts.join(", ");
}

/**
 * Avvikene som peker paa feltet. For et helt felt (`finn.body`) teller ogsaa
 * avvik paa et avsnitt i det (`finn.body.p3`); for ett avsnitt bare det.
 */
export function issuesForField(issues: readonly ListingTextIssue[], path: string): ListingTextIssue[] {
  return issues.filter((i) => i.fields.some((f) => f === path || f.startsWith(`${path}.`)));
}

/** Kodene fra backend som betyr at feltet er utenfor maalet (K §9.2). */
export const OUTSIDE_TARGET_CODES: ReadonlySet<string> = new Set(["length_outside_target", "headline_too_long"]);

/** Utenfor maalet bare naar backend sier det: et avvik med en av kodene over og feltet i `fields`. */
export function outsideTarget(issues: readonly ListingTextIssue[], path: string): boolean {
  return issues.some((i) => OUTSIDE_TARGET_CODES.has(i.code) && i.fields.includes(path));
}

// --- lengdene ----------------------------------------------------------------

/**
 * Antallet og maalet for et felt: «62 ord · mål 50–90». Hovedteksten faar
 * maalet som én tekst fra ordlista (`listingText.length.bodyTarget`): 180-350
 * ord for alle boliger, uten «Verdt å vite» (valg b).
 */
export function lengthText(locale: Locale, path: LengthPath, value: number): string {
  const [unit, min, max] = LENGTH_TARGETS[path];
  if (path === "finn.body") {
    const target = t(locale, "listingText.length.bodyTarget", { min, max });
    return t(locale, "listingText.length.bodyLine", { n: value, target });
  }
  const key = unit === "chars" ? "listingText.length.chars" : unit === "words" ? "listingText.length.words" : "listingText.length.items";
  return t(locale, key, { n: value, min, max });
}

/** Siste avsnitt i hovedteksten naar det er «Verdt å vite», med antall ord for seg. */
export function worthKnowing(body: readonly TextItem[]): { id: string; words: number } | null {
  const last = body.at(-1);
  if (last === undefined || splitWorthKnowing(last.text) === null) return null;
  return { id: last.id, words: countWords(last.text) };
}

/** Merknaden for et avsnitt eller hoeydepunkt. `supported` (og ingen verdi) vises ikke. */
export function checkKey(check: ParagraphCheck | null): UiKey | null {
  if (check === "partial") return "listingText.check.partial";
  if (check === "unsupported") return "listingText.check.unsupported";
  return null;
}

// --- toppen ------------------------------------------------------------------

export type StatusTone = "amber" | "green" | "neutral" | "red";

export function statusTone(status: ListingTextStatus | null): StatusTone {
  if (status === "to_review") return "amber";
  if (status === "approved") return "green";
  if (status === "failed") return "red";
  return "neutral";
}

/** Tidspunktet for versjonen som vises (fra `versions`), ellers da pakken sist ble endret. */
export function versionTime(locale: Locale, pkg: ListingText): string {
  const row = pkg.versions.find((v) => v.version === pkg.version);
  return formatDate(row?.createdAt || pkg.updatedAt || null, locale);
}

/**
 * Linja om at siste forsoek feilet mens en eldre versjon vises (K §0: statusen
 * til versjonen beholdes, `last_run.status` er `failed`). Null ellers.
 */
export function lastRunFailedText(locale: Locale, pkg: ListingText): string | null {
  if (pkg.version === null || pkg.lastRun?.status !== "failed") return null;
  const reason = codeText(locale, "listingTextRunError", pkg.lastRun.errorCode);
  return t(locale, "listingText.package.lastRunFailed", { reason, n: pkg.version });
}

// --- kildene og grunnlaget ---------------------------------------------------

/** `fact_ids` for et felt; for avsnitt og hoeydepunkter alle id-ene i lista, uten like. */
export function fieldFactIds(channels: ListingTextChannels, path: string): string[] {
  const fp = parseFieldPath(path);
  if (fp === null) return [];
  const value = channelRecord(channels, fp.channel)?.[typedName(fp.field)];
  if (value === null || value === undefined) return [];
  if (fp.kind === "items") {
    const items = value as TextItem[];
    const chosen = fp.itemId === null ? items : items.filter((i) => i.id === fp.itemId);
    return [...new Set(chosen.flatMap((i) => i.factIds))];
  }
  if (fp.kind === "text") return [...(value as { factIds: string[] }).factIds];
  return [];
}

/** Faktaene for id-ene, i samme rekkefoelge. Ukjente id-er hoppes over. */
export function factsFor(basis: ListingTextBasis | null, ids: readonly string[]): Fact[] {
  if (basis === null) return [];
  const byId = new Map(basis.facts.map((f) => [f.id, f]));
  const out: Fact[] = [];
  for (const id of new Set(ids)) {
    const fact = byId.get(id);
    if (fact !== undefined) out.push(fact);
  }
  return out;
}

/** Navnet paa en fakta: `label` fra backend, ellers feltkoden. */
export function factName(fact: Fact): string {
  return fact.label || fact.field;
}

export interface FactSourceView {
  /** «Salgsoppgave, side 4», «Bilde 3», «Oppgitt av megler», «Regnet ut fra …». */
  text: string;
  /** Dokumentet og siden for «Åpne PDF», eller null. */
  pdf: { documentId: string; page: number | null } | null;
}

function documentKindOf(fact: Fact, documents: readonly ListingTextDocument[]): string | null {
  const id = fact.source?.documentId ?? null;
  return fact.source?.documentKind ?? documents.find((d) => d.id === id)?.kind ?? null;
}

/** Kilden til en fakta, etter `kind` (K §5). */
export function factSource(
  locale: Locale,
  fact: Fact,
  documents: readonly ListingTextDocument[],
  basis: ListingTextBasis | null
): FactSourceView {
  switch (fact.kind) {
    case "document": {
      const kind = codeText(locale, "listingTextDocumentKind", documentKindOf(fact, documents));
      const page = fact.source?.page ?? null;
      const documentId = fact.source?.documentId ?? null;
      return {
        text: page === null ? kind : `${kind}, ${t(locale, "listingText.sources.page", { n: page })}`,
        pdf: documentId === null ? null : { documentId, page },
      };
    }
    case "visual": {
      const position = fact.source?.position ?? null;
      return {
        text: position === null ? t(locale, "listingText.sources.imageAny") : t(locale, "listingText.sources.image", { n: position }),
        pdf: null,
      };
    }
    case "broker":
      return { text: t(locale, "listingText.sources.broker"), pdf: null };
    case "computed": {
      const inputs = factsFor(basis, fact.inputs).map(factName);
      return {
        text:
          inputs.length === 0
            ? t(locale, "listingText.sources.computed")
            : t(locale, "listingText.sources.computedFrom", { inputs: inputs.join(", ") }),
        pdf: null,
      };
    }
  }
}

export interface FactGroup {
  key: string;
  title: string;
  facts: Fact[];
}

/**
 * Faktaene i «Se grunnlag», gruppert etter kilde: ett dokument om gangen (i
 * rekkefoelgen de dukker opp), saa bildene, megleren og det som er regnet ut.
 */
export function groupFacts(locale: Locale, facts: readonly Fact[], documents: readonly ListingTextDocument[]): FactGroup[] {
  const docGroups = new Map<string, FactGroup>();
  const visual: Fact[] = [];
  const broker: Fact[] = [];
  const computed: Fact[] = [];
  for (const fact of facts) {
    if (fact.kind === "document") {
      const id = fact.source?.documentId ?? "";
      let group = docGroups.get(id);
      if (group === undefined) {
        const kind = codeText(locale, "listingTextDocumentKind", documentKindOf(fact, documents));
        const file = documents.find((d) => d.id === id)?.fileName ?? "";
        group = { key: `doc:${id}`, title: file ? `${kind} · ${file}` : kind, facts: [] };
        docGroups.set(id, group);
      }
      group.facts.push(fact);
    } else if (fact.kind === "visual") visual.push(fact);
    else if (fact.kind === "broker") broker.push(fact);
    else computed.push(fact);
  }
  const out = [...docGroups.values()];
  if (visual.length > 0) out.push({ key: "visual", title: t(locale, "listingText.basis.images"), facts: visual });
  if (broker.length > 0) out.push({ key: "broker", title: t(locale, "listingText.sources.broker"), facts: broker });
  if (computed.length > 0) out.push({ key: "computed", title: t(locale, "listingText.sources.computed"), facts: computed });
  return out;
}

/**
 * Grunnlaget for versjonen som vises: GET med `include=basis` (K §9.3 punkt 2).
 * Kalles én gang naar pakken er klar og naar versjonen endres
 * (useListingTextBasis), aldri i hentingen mens pakken behandles.
 */
export async function fetchBasis(request: AssignmentRequest, id: string, version: number): Promise<ListingTextBasis | null> {
  const pkg = await getListingText(request, id, { includeBasis: true, version });
  return pkg.basis;
}

// --- «Åpne PDF» --------------------------------------------------------------

/** Lenken med `#page=N` naar siden er kjent. Et anker fra foer byttes ut. */
export function pdfHref(url: string, page: number | null): string {
  const base = url.split("#")[0];
  return page !== null && page >= 1 ? `${base}#page=${page}` : base;
}

/** Den nye fanen, slik `window.open` gir den. */
export interface PdfTab {
  location: { replace(url: string): void };
  close(): void;
}

export type PdfResult =
  | { kind: "opened" }
  | { kind: "mock" }
  | { kind: "blocked" }
  | { kind: "error"; code: string };

/** Lenkene fra mock-backenden (listingTextMock.ts) aapnes aldri. */
const MOCK_SCHEME = "mock:";

/**
 * «Åpne PDF»: `openTab` kalles foerst, i selve klikket, saa Safari ikke
 * stopper fanen som popup; adressen settes naar svaret kommer. Lenken lever
 * bare i denne funksjonen: den gis ikke tilbake, logges ikke og staar ikke i
 * feilen. 404 (admin, eller dokumentet er borte) gir koden `not_owner`.
 */
export async function openListingTextDocument(opts: {
  request: AssignmentRequest;
  id: string;
  documentId: string;
  page: number | null;
  openTab: () => PdfTab | null;
}): Promise<PdfResult> {
  const tab = opts.openTab();
  let url: string;
  try {
    url = await getListingTextDocumentUrl(opts.request, { id: opts.id, documentId: opts.documentId });
  } catch (err) {
    tab?.close();
    const code = err instanceof ListingTextError && err.httpStatus === 404 ? "not_owner" : listingTextErrorCode(err);
    return { kind: "error", code };
  }
  if (url.startsWith(MOCK_SCHEME)) {
    tab?.close();
    return { kind: "mock" };
  }
  if (tab === null) return { kind: "blocked" };
  tab.location.replace(pdfHref(url, opts.page));
  return { kind: "opened" };
}

/**
 * Ny, tom fane i klikket. `opener` nullstilles, saa siden i fanen ikke kan
 * styre vaar side. Lenken settes senere med `location.replace` i fanen.
 */
export function browserOpenTab(): PdfTab | null {
  const tab = window.open("about:blank", "_blank");
  if (tab === null) return null;
  tab.opener = null;
  return tab;
}

/** Teksten etter «Åpne PDF», eller null naar fanen ble aapnet. */
export function pdfResultText(locale: Locale, result: PdfResult): string | null {
  switch (result.kind) {
    case "opened":
      return null;
    case "mock":
      return t(locale, "listingText.pdf.mock");
    case "blocked":
      return t(locale, "listingText.pdf.blocked");
    case "error":
      return result.code === "not_owner"
        ? t(locale, "listingText.pdf.notOwner")
        : codeText(locale, "listingTextError", result.code);
  }
}
