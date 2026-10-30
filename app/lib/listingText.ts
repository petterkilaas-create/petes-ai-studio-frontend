import type { UiKey } from "./i18n/index.ts";
import type { AssignmentRequest } from "./assignments.ts";

/**
 * Annonsetekst per ordre (TG-NEW-281, T0). Typer, parsing, feltstier, teller
 * og API-kall etter kontraktutkastet (annonsetekst/KONTRAKT_ANNONSETEKST_UTKAST.md,
 * heretter K; §9 gjelder foran §0-§8). JSON-formen eies av backend-skjemaet
 * `services/listing_text_schema.py` (TEKST-1k); der de er uenige, foelger
 * modulen skjemaet. Navnene kan endres naar backend 1b er merget; da endres
 * de her og i testene.
 *
 * Ren modul uten runtime-importer fra api.ts, som assignments.ts: kallene tar
 * en `request` som kobles til authedFetch der modulen tas i bruk (T1-T4), og
 * testes med en falsk. Ikke i bruk ennaa.
 *
 * Teksten i pakken er alltid norsk (K §5), ogsaa naar appen er paa engelsk.
 */

/** Spraaket i tekstpakken (`lang` paa tekstfeltene). Egen konstant, ikke merketekstens. */
export const LISTING_TEXT_LOCALE = "nb" as const;

// --- grenser (K §1-§3, §9.1 og listing_text_schema.py) ----------------------

export const MAX_DOCUMENTS = 10;
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
export const DOCUMENT_CONTENT_TYPE = "application/pdf";
export const NOTE_MAX_CHARS = 1000;
export const DAILY_RUNS = 10;
export const EMAIL_SIGNATURE_MAX_CHARS = 500;
export const EMAIL_CTA_MAX_CHARS = 80;
export const AVOID_WORDS_MAX = 50;
export const AVOID_WORD_MAX_CHARS = 40;

// --- lukkede lister ----------------------------------------------------------

/** `display_status` for pakken (K §0). */
export const LISTING_TEXT_STATUSES = ["not_ordered", "processing", "to_review", "approved", "failed"] as const;
export type ListingTextStatus = (typeof LISTING_TEXT_STATUSES)[number];

/** `last_run.step` mens pakken behandles (K §0), i rekkefoelge. */
export const RUN_STEPS = ["reading_documents", "viewing_images", "planning", "writing", "checking"] as const;
export type RunStep = (typeof RUN_STEPS)[number];

/** `last_run.status` (K §0 og §5). */
export const RUN_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const SEVERITIES = ["material", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** De seks fra Forbrukertilsynet, i rekkefoelgen i faktalinja (skjemaet `KEY_NAMES`). */
export const KEY_NAMES = ["total_price", "location", "property_type", "bra_i", "bedrooms", "energy_label"] as const;
export type KeyName = (typeof KEY_NAMES)[number];

export const KEY_STATUSES = ["found", "missing", "conflict"] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

export const FACT_KINDS = ["document", "visual", "broker", "computed"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

/** `check` per avsnitt og hoeydepunkt (K §5). */
export const PARAGRAPH_CHECKS = ["supported", "partial", "unsupported"] as const;
export type ParagraphCheck = (typeof PARAGRAPH_CHECKS)[number];

/**
 * Dokumenttypene etter skjemaet (`DocumentKind`, K §9.3 punkt 3 rettet 30.10).
 * Egenerklaering, plantegning og annet er `other` i v1. Ukjent kode vises med
 * den generiske teksten i ordlista, saa `kind` leses som tekst.
 */
export const DOCUMENT_KINDS = [
  "sales_prospectus",
  "condition_report",
  "energy_certificate",
  "association_info",
  "area_report",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = ["pending", "ready", "rejected"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const VERSION_SOURCES = ["generated", "edited"] as const;
export type VersionSource = (typeof VERSION_SOURCES)[number];

export const CHANNELS = ["finn", "social", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

export const OFFICE_STYLES = ["concrete_warm", "concrete_short", "concrete_formal"] as const;
export type OfficeStyle = (typeof OFFICE_STYLES)[number];

export const ADDRESS_FORMS = ["du", "none"] as const;
export type AddressForm = (typeof ADDRESS_FORMS)[number];

// --- typer for svaret (K §5 med §9) ------------------------------------------

/** Et tekstfelt i en kanal. */
export interface TextField {
  text: string;
  factIds: string[];
}

/** Et avsnitt (`p1` …) eller hoeydepunkt (`h1` …). */
export interface TextItem extends TextField {
  id: string;
  check: ParagraphCheck | null;
}

/**
 * «Kopier» per felt (K §9.3 punkt 5): ferdig tekst fra backend, lik eksporten.
 * Noekkelen er feltnavnet i kanalen (`headline`, `body` …): svaret har
 * `channels.<kanal>.copy_text = {"<felt>": "…"}` (K §9.3 punkt 5, rettet 30.10).
 */
export type CopyTexts = Readonly<Record<string, string>>;

export interface FinnChannel {
  headline: TextField;
  intro: TextField;
  body: TextItem[];
  highlights: TextItem[];
  neighbourhood: TextField | null;
  copyText: CopyTexts;
}

export interface SocialChannel {
  post: TextField;
  /** Settes i kode fra de seks (K §9.2 punkt 4), kan ikke redigeres. */
  factLine: TextField;
  hashtags: string[];
  copyText: CopyTexts;
}

export interface EmailChannel {
  subject: TextField;
  preheader: TextField;
  body: TextField;
  /** Fra kontorprofilen, kan ikke redigeres. */
  signature: string;
  copyText: CopyTexts;
}

/** En kanal kan mangle (kontorprofilens `channels`). */
export interface ListingTextChannels {
  finn: FinnChannel | null;
  social: SocialChannel | null;
  email: EmailChannel | null;
}

export interface KeyFact {
  key: KeyName;
  status: KeyStatus;
  valueText: string | null;
  factIds: string[];
}

export interface ListingTextIssue {
  id: string;
  /** `conflicting_bra_i`, `length_outside_target` … (K §9.2). Teksten kommer ferdig i `message`. */
  code: string;
  severity: Severity;
  /** Norsk tekst fra backend: vises med `lang="nb"` ogsaa paa engelsk. */
  message: string;
  suggestion: string | null;
  factIds: string[];
  /** Feltstier (`finn.intro`, `finn.body.p3`). */
  fields: string[];
}

export interface FactSource {
  documentId: string | null;
  documentKind: string | null;
  page: number | null;
  excerpt: string | null;
  imageId: string | null;
  position: number | null;
  note: boolean;
}

export interface Fact {
  id: string;
  field: string;
  label: string;
  valueText: string;
  value: number | null;
  unit: string | null;
  kind: FactKind;
  source: FactSource | null;
  /** Leddene i en utregnet fakta (`kind: computed`). */
  inputs: string[];
  material: boolean;
}

export interface BasisPlan {
  angle: string;
  qualities: { text: string; factIds: string[] }[];
  mustInclude: string[];
  unknowns: string[];
}

/** Grunnlaget: bare med `?include=basis` (K §9.3 punkt 2). */
export interface ListingTextBasis {
  schemaVersion: number;
  facts: Fact[];
  plan: BasisPlan | null;
  issues: ListingTextIssue[];
}

export interface ListingTextDocument {
  id: string;
  fileName: string;
  bytes: number | null;
  /** Ukjent verdi fra backend gir null. */
  status: DocumentStatus | null;
  /** `null` til kjoeringen har lest dokumentet (K §9.1 punkt 9). Se DOCUMENT_KINDS. */
  kind: string | null;
  pages: number | null;
  rejectCode: string | null;
  usedInVersion: boolean;
  createdAt: string;
}

export interface ListingTextRun {
  id: string;
  kind: string;
  status: RunStatus | null;
  step: RunStep | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingTextVersion {
  version: number;
  source: VersionSource | null;
  createdAt: string;
}

/** `approved` og radene i `approved_history` (K §9.3 punkt 8). */
export interface ListingTextApproval {
  version: number;
  contentSha256: string;
  at: string;
  byRole: string;
}

/** `null` for admin og redaktoer (K §9.1 punkt 4). */
export interface ListingTextLimits {
  dailyRuns: number;
  runsLeftToday: number;
}

export interface ListingText {
  assignmentId: string;
  /** Ukjent verdi fra backend gir null (teksten blir «Ukjent status»). */
  displayStatus: ListingTextStatus | null;
  version: number | null;
  versions: ListingTextVersion[];
  contentSha256: string | null;
  basisSha256: string | null;
  approved: ListingTextApproval | null;
  approvedHistory: ListingTextApproval[];
  lastRun: ListingTextRun | null;
  documents: ListingTextDocument[];
  imagesUsed: { imageId: string; position: number }[];
  note: string | null;
  keyFacts: KeyFact[];
  issues: ListingTextIssue[];
  /** `null` foer foerste versjon og etter sletting. */
  channels: ListingTextChannels | null;
  basis: ListingTextBasis | null;
  limits: ListingTextLimits | null;
  mediaDeletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Svaret paa starten av en opplasting (K §2). `upload` logges aldri (token). */
export interface DocumentUploadStart {
  document: ListingTextDocument;
  upload: { signedUrl: string; token: string; path: string; expiresAt: string };
}

export interface OfficeProfileSettings {
  schemaVersion: number;
  style: OfficeStyle | null;
  addressForm: AddressForm | null;
  avoidWords: string[];
  emailSignature: string | null;
  emailCta: string | null;
  channels: Channel[];
}

export interface OfficeProfile {
  scope: string;
  version: number;
  isDefault: boolean;
  settings: OfficeProfileSettings;
}

// --- parsing -----------------------------------------------------------------
//
// Ukjente felt hoppes over. Feil form avvises: parseListingText gir null naar
// et felt som finnes har feil type (f.eks. `channels.finn.headline.text` som
// ikke er tekst), saa en halv pakke aldri vises eller godkjennes. Ukjente
// koder i en lukket liste gir null, som i assignments.ts.

/** Kastes inne i parsingen ved feil form; fanges i parseListingText. */
class Shape extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Feltet er et objekt eller mangler (null/undefined). Annet er feil form. */
function optRecord(value: unknown, what: string): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new Shape(what);
  return value;
}

function reqRecord(value: unknown, what: string): Record<string, unknown> {
  const rec = optRecord(value, what);
  if (rec === null) throw new Shape(what);
  return rec;
}

/** Lista, eller [] naar feltet mangler. Annet enn en liste er feil form. */
function list(value: unknown, what: string): unknown[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Shape(what);
  return value;
}

/** Id-er (`fact_ids`, `inputs` …): bare tekst. */
function ids(value: unknown, what: string): string[] {
  return list(value, what).map((v) => {
    if (typeof v !== "string") throw new Shape(what);
    return v;
  });
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw new Shape(what);
  return value;
}

function textField(raw: unknown, what: string): TextField {
  const rec = reqRecord(raw, what);
  return { text: text(rec.text, `${what}.text`), factIds: ids(rec.fact_ids, `${what}.fact_ids`) };
}

function textItems(raw: unknown, what: string): TextItem[] {
  return list(raw, what).map((row, i) => {
    const rec = reqRecord(row, `${what}[${i}]`);
    const id = str(rec.id);
    if (id === null) throw new Shape(`${what}[${i}].id`);
    return {
      id,
      text: text(rec.text, `${what}.${id}.text`),
      factIds: ids(rec.fact_ids, `${what}.${id}.fact_ids`),
      check: oneOf(rec.check, PARAGRAPH_CHECKS),
    };
  });
}

function copyTexts(raw: unknown, what: string): CopyTexts {
  const rec = optRecord(raw, what);
  const out: Record<string, string> = {};
  if (rec === null) return out;
  for (const [field, value] of Object.entries(rec)) {
    if (typeof value === "string") out[field] = value;
  }
  return out;
}

function parseFinn(raw: unknown): FinnChannel | null {
  const rec = optRecord(raw, "channels.finn");
  if (rec === null) return null;
  return {
    headline: textField(rec.headline, "finn.headline"),
    intro: textField(rec.intro, "finn.intro"),
    body: textItems(rec.body, "finn.body"),
    highlights: textItems(rec.highlights, "finn.highlights"),
    neighbourhood: rec.neighbourhood == null ? null : textField(rec.neighbourhood, "finn.neighbourhood"),
    copyText: copyTexts(rec.copy_text, "finn.copy_text"),
  };
}

function parseSocial(raw: unknown): SocialChannel | null {
  const rec = optRecord(raw, "channels.social");
  if (rec === null) return null;
  return {
    post: textField(rec.post, "social.post"),
    factLine: textField(rec.fact_line, "social.fact_line"),
    hashtags: ids(rec.hashtags, "social.hashtags"),
    copyText: copyTexts(rec.copy_text, "social.copy_text"),
  };
}

function parseEmail(raw: unknown): EmailChannel | null {
  const rec = optRecord(raw, "channels.email");
  if (rec === null) return null;
  return {
    subject: textField(rec.subject, "email.subject"),
    preheader: textField(rec.preheader, "email.preheader"),
    body: textField(rec.body, "email.body"),
    signature: rec.signature == null ? "" : text(rec.signature, "email.signature"),
    copyText: copyTexts(rec.copy_text, "email.copy_text"),
  };
}

function parseChannels(raw: unknown): ListingTextChannels | null {
  const rec = optRecord(raw, "channels");
  if (rec === null) return null;
  return { finn: parseFinn(rec.finn), social: parseSocial(rec.social), email: parseEmail(rec.email) };
}

/** Raden i `key_facts`. Ukjent noekkel eller status hoppes over (nyere backend). */
function parseKeyFacts(raw: unknown): KeyFact[] {
  const out: KeyFact[] = [];
  for (const row of list(raw, "key_facts")) {
    const rec = reqRecord(row, "key_facts[]");
    const key = oneOf(rec.key, KEY_NAMES);
    const status = oneOf(rec.status, KEY_STATUSES);
    if (key === null || status === null) continue;
    out.push({ key, status, valueText: str(rec.value_text), factIds: ids(rec.fact_ids, "key_facts[].fact_ids") });
  }
  return out;
}

/**
 * Avvikene. Uten `message` kan ikke avviket vises, og det hoppes over. Ukjent
 * `severity` regnes som `material`: et avvik skjules aldri og havner heller
 * oeverst enn nederst [vurdering, rapporten T0].
 */
function parseIssues(raw: unknown, what: string): ListingTextIssue[] {
  const out: ListingTextIssue[] = [];
  for (const row of list(raw, what)) {
    const rec = reqRecord(row, `${what}[]`);
    const message = str(rec.message);
    if (message === null) continue;
    out.push({
      id: str(rec.id) ?? "",
      code: str(rec.code) ?? "",
      severity: oneOf(rec.severity, SEVERITIES) ?? "material",
      message,
      suggestion: str(rec.suggestion),
      factIds: ids(rec.fact_ids, `${what}[].fact_ids`),
      fields: ids(rec.fields, `${what}[].fields`),
    });
  }
  return out;
}

function parseSource(raw: unknown): FactSource | null {
  const rec = optRecord(raw, "basis.facts[].source");
  if (rec === null) return null;
  return {
    documentId: str(rec.document_id),
    documentKind: str(rec.document_kind),
    page: int(rec.page),
    excerpt: str(rec.excerpt),
    imageId: str(rec.image_id),
    position: int(rec.position),
    note: rec.note === true,
  };
}

/** En fakta, eller null uten `id`, verdi eller kjent `kind`. */
function parseFact(raw: unknown): Fact | null {
  const rec = reqRecord(raw, "basis.facts[]");
  const id = str(rec.id);
  const valueText = str(rec.value_text);
  const kind = oneOf(rec.kind, FACT_KINDS);
  if (id === null || valueText === null || kind === null) return null;
  return {
    id,
    field: str(rec.field) ?? "other",
    label: str(rec.label) ?? "",
    valueText,
    value: typeof rec.value === "number" && Number.isFinite(rec.value) ? rec.value : null,
    unit: str(rec.unit),
    kind,
    source: parseSource(rec.source),
    inputs: ids(rec.inputs, "basis.facts[].inputs"),
    material: rec.material === true,
  };
}

function parsePlan(raw: unknown): BasisPlan | null {
  const rec = optRecord(raw, "basis.plan");
  if (rec === null) return null;
  return {
    angle: str(rec.angle) ?? "general",
    qualities: list(rec.qualities, "basis.plan.qualities").map((q) => {
      const qr = reqRecord(q, "basis.plan.qualities[]");
      return { text: text(qr.text, "basis.plan.qualities[].text"), factIds: ids(qr.fact_ids, "basis.plan.qualities[].fact_ids") };
    }),
    mustInclude: ids(rec.must_include, "basis.plan.must_include"),
    unknowns: ids(rec.unknowns, "basis.plan.unknowns"),
  };
}

function parseBasis(raw: unknown): ListingTextBasis | null {
  const rec = optRecord(raw, "basis");
  if (rec === null) return null;
  const facts: Fact[] = [];
  for (const row of list(rec.facts, "basis.facts")) {
    const fact = parseFact(row);
    if (fact !== null) facts.push(fact);
  }
  return {
    schemaVersion: int(rec.schema_version) ?? 1,
    facts,
    plan: parsePlan(rec.plan),
    issues: parseIssues(rec.issues, "basis.issues"),
  };
}

/** Et dokument (K §2 og §5), eller null uten `id`. */
export function parseDocument(raw: unknown): ListingTextDocument | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (id === null) return null;
  return {
    id,
    fileName: str(raw.file_name) ?? "",
    bytes: int(raw.bytes),
    status: oneOf(raw.status, DOCUMENT_STATUSES),
    kind: str(raw.kind),
    pages: int(raw.pages),
    rejectCode: str(raw.reject_code),
    usedInVersion: raw.used_in_version === true,
    createdAt: str(raw.created_at) ?? "",
  };
}

function parseRun(raw: unknown): ListingTextRun | null {
  const rec = optRecord(raw, "last_run");
  if (rec === null) return null;
  return {
    id: str(rec.id) ?? "",
    kind: str(rec.kind) ?? "",
    status: oneOf(rec.status, RUN_STATUSES),
    step: oneOf(rec.step, RUN_STEPS),
    errorCode: str(rec.error_code),
    createdAt: str(rec.created_at) ?? "",
    updatedAt: str(rec.updated_at) ?? "",
  };
}

function parseApproval(raw: unknown): ListingTextApproval | null {
  if (!isRecord(raw)) return null;
  const version = int(raw.version);
  const contentSha256 = str(raw.content_sha256);
  if (version === null || contentSha256 === null) return null;
  return { version, contentSha256, at: str(raw.at) ?? "", byRole: str(raw.by_role) ?? "" };
}

function parseLimits(raw: unknown): ListingTextLimits | null {
  const rec = optRecord(raw, "limits");
  if (rec === null) return null;
  const dailyRuns = int(rec.daily_runs);
  const runsLeftToday = int(rec.runs_left_today);
  if (dailyRuns === null || runsLeftToday === null) return null;
  return { dailyRuns, runsLeftToday };
}

/**
 * Hele svaret fra GET, bestillingen, «Lag paa nytt», lagringen og godkjenningen
 * (K §5). Null naar formen er feil: ikke et objekt, uten `assignment_id` eller
 * `display_status`, eller et felt med feil type (se over).
 */
export function parseListingText(raw: unknown): ListingText | null {
  if (!isRecord(raw)) return null;
  const assignmentId = str(raw.assignment_id);
  if (assignmentId === null || typeof raw.display_status !== "string") return null;
  try {
    const documents: ListingTextDocument[] = [];
    for (const row of list(raw.documents, "documents")) {
      const doc = parseDocument(row);
      if (doc !== null) documents.push(doc);
    }
    const versions: ListingTextVersion[] = [];
    for (const row of list(raw.versions, "versions")) {
      const rec = reqRecord(row, "versions[]");
      const version = int(rec.version);
      if (version === null || version < 1) continue;
      versions.push({ version, source: oneOf(rec.source, VERSION_SOURCES), createdAt: str(rec.created_at) ?? "" });
    }
    versions.sort((a, b) => a.version - b.version);
    const imagesUsed: { imageId: string; position: number }[] = [];
    for (const row of list(raw.images_used, "images_used")) {
      const rec = reqRecord(row, "images_used[]");
      const imageId = str(rec.image_id);
      if (imageId !== null) imagesUsed.push({ imageId, position: int(rec.position) ?? 0 });
    }
    return {
      assignmentId,
      displayStatus: oneOf(raw.display_status, LISTING_TEXT_STATUSES),
      version: int(raw.version),
      versions,
      contentSha256: str(raw.content_sha256),
      basisSha256: str(raw.basis_sha256),
      approved: raw.approved == null ? null : parseApproval(reqRecord(raw.approved, "approved")),
      approvedHistory: list(raw.approved_history, "approved_history")
        .map(parseApproval)
        .filter((a): a is ListingTextApproval => a !== null),
      lastRun: parseRun(raw.last_run),
      documents,
      imagesUsed,
      note: str(raw.note),
      keyFacts: parseKeyFacts(raw.key_facts),
      issues: parseIssues(raw.issues, "issues"),
      channels: parseChannels(raw.channels),
      basis: parseBasis(raw.basis),
      limits: parseLimits(raw.limits),
      mediaDeletedAt: str(raw.media_deleted_at),
      createdAt: str(raw.created_at) ?? "",
      updatedAt: str(raw.updated_at) ?? "",
    };
  } catch (err) {
    if (err instanceof Shape) return null;
    throw err;
  }
}

/** Svaret paa starten av en opplasting (K §2), eller null uten dokument og lenke. */
export function parseDocumentUploadStart(raw: unknown): DocumentUploadStart | null {
  if (!isRecord(raw) || !isRecord(raw.upload)) return null;
  const document = parseDocument(raw.document);
  const signedUrl = str(raw.upload.signed_url);
  const token = str(raw.upload.token);
  const path = str(raw.upload.path);
  if (document === null || signedUrl === null || token === null || path === null) return null;
  return { document, upload: { signedUrl, token, path, expiresAt: str(raw.upload.expires_at) ?? "" } };
}

/** Kontorprofilen (K §1), eller null uten `version` og `settings`. Ukjente kanaler hoppes over. */
export function parseOfficeProfile(raw: unknown): OfficeProfile | null {
  if (!isRecord(raw) || !isRecord(raw.settings)) return null;
  const version = int(raw.version);
  if (version === null) return null;
  const s = raw.settings;
  const avoidWords = Array.isArray(s.avoid_words) ? s.avoid_words.filter((w): w is string => typeof w === "string") : [];
  const channels = Array.isArray(s.channels)
    ? CHANNELS.filter((c) => (s.channels as unknown[]).includes(c))
    : [...CHANNELS];
  return {
    scope: str(raw.scope) ?? "user",
    version,
    isDefault: raw.is_default === true,
    settings: {
      schemaVersion: int(s.schema_version) ?? 1,
      style: oneOf(s.style, OFFICE_STYLES),
      addressForm: oneOf(s.address_form, ADDRESS_FORMS),
      avoidWords,
      emailSignature: str(s.email_signature),
      emailCta: str(s.email_cta),
      channels,
    },
  };
}

// --- tekst -------------------------------------------------------------------

/**
 * Ordlistenoekkelen for statusen til pakken (K §0). Samme ord som ordreflyten
 * for `processing`, `to_review` og `failed`; «Godkjent» og «Ikke bestilt» er
 * egne. Ukjent eller manglende gir «Ukjent status».
 */
export function listingTextStatusKey(status: ListingTextStatus | null): UiKey {
  switch (status) {
    case "not_ordered":
      return "listingText.status.notOrdered";
    case "processing":
      return "assignment.status.processing";
    case "to_review":
      return "assignment.status.toReview";
    case "approved":
      return "listingText.status.approved";
    case "failed":
      return "assignment.status.failed";
    default:
      return "status.unknown";
  }
}

const STEP_KEYS: Readonly<Record<RunStep | "done", UiKey>> = {
  reading_documents: "listingText.step.readingDocuments",
  viewing_images: "listingText.step.viewingImages",
  planning: "listingText.step.planning",
  writing: "listingText.step.writing",
  checking: "listingText.step.checking",
  done: "listingText.step.done",
};

/** Ordlistenoekkelen for et trinn (K §0). `done` er «Klar». */
export function runStepKey(step: RunStep | "done"): UiKey {
  return STEP_KEYS[step];
}

/** Ordlistenoekkelen for alvoret i et avvik (K §9.2: tekst per `severity`, ikke per kode). */
export function severityKey(severity: Severity): UiKey {
  return severity === "material" ? "listingText.severity.material" : "listingText.severity.info";
}

const KEY_STATUS_KEYS: Readonly<Record<KeyStatus, UiKey>> = {
  found: "listingText.keyStatus.found",
  missing: "listingText.keyStatus.missing",
  conflict: "listingText.keyStatus.conflict",
};

/** Ordlistenoekkelen for statusen til en noekkelopplysning («funnet», «mangler», «uavklart»). */
export function keyStatusKey(status: KeyStatus): UiKey {
  return KEY_STATUS_KEYS[status];
}

/** Avvikene med `material` foerst; ellers i rekkefoelgen fra backend. */
export function sortIssues(issues: readonly ListingTextIssue[]): ListingTextIssue[] {
  return [...issues].sort((a, b) => Number(a.severity !== "material") - Number(b.severity !== "material"));
}

// --- feltstiene (skjemaet `FIELD_TYPES`, K §4 og §9.3 punkt 4) ---------------

/**
 * kanal -> felt -> type, som i skjemaet. `text` er et objekt med `text`;
 * `items` er avsnitt eller hoeydepunkter med id; `tags` er emneknaggene;
 * `plain` er en ren streng.
 */
export const FIELD_TYPES = {
  finn: { headline: "text", intro: "text", body: "items", highlights: "items", neighbourhood: "text" },
  social: { post: "text", fact_line: "text", hashtags: "tags" },
  email: { subject: "text", preheader: "text", body: "text", signature: "plain" },
} as const satisfies Record<Channel, Record<string, "text" | "items" | "tags" | "plain">>;

export type FieldKind = "text" | "items" | "tags" | "plain";

/** Settes i kode, aldri i redigeringen (K §9.2 punkt 5). */
export const NOT_EDITABLE: ReadonlySet<string> = new Set(["social.fact_line", "email.signature"]);

const FIELD_PATH_MAX = 64;

export interface FieldPath {
  channel: Channel;
  field: string;
  kind: FieldKind;
  /** `p2`, `h1` for ett avsnitt eller hoeydepunkt, ellers null. */
  itemId: string | null;
}

function fieldKind(channel: string, field: string): FieldKind | null {
  if (!Object.hasOwn(FIELD_TYPES, channel)) return null;
  const fields: Record<string, FieldKind> = FIELD_TYPES[channel as Channel];
  return Object.hasOwn(fields, field) ? fields[field] : null;
}

/**
 * `<kanal>.<felt>` eller `<kanal>.<felt>.<avsnitts-id>`, som
 * `parse_field_path` i skjemaet. Null for ukjent sti. Med `editable` avvises
 * feltene som settes i kode, og en liste uten avsnitts-id (redigeringen gjelder
 * ett avsnitt om gangen).
 */
export function parseFieldPath(path: string, opts: { editable?: boolean } = {}): FieldPath | null {
  if (typeof path !== "string" || path.length > FIELD_PATH_MAX) return null;
  const parts = path.split(".");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const [channel, field] = parts;
  const kind = fieldKind(channel, field);
  if (kind === null) return null;
  const itemId = parts.length === 3 ? parts[2] : null;
  if (itemId !== null) {
    const prefix = field === "body" ? "p" : "h";
    if (kind !== "items" || !new RegExp(`^${prefix}[0-9]{1,3}$`).test(itemId)) return null;
  }
  if (opts.editable) {
    if (NOT_EDITABLE.has(`${channel}.${field}`)) return null;
    if (kind === "items" && itemId === null) return null;
  }
  return { channel: channel as Channel, field, kind, itemId };
}

export function isEditableFieldPath(path: string): boolean {
  return parseFieldPath(path, { editable: true }) !== null;
}

function channelRecord(channels: ListingTextChannels, channel: Channel): Record<string, unknown> | null {
  const value = channels[channel];
  return value === null ? null : (value as unknown as Record<string, unknown>);
}

/** Feltnavnet i skjemaet til navnet i typene her (`fact_line` -> `factLine`). */
function typedName(field: string): string {
  return field.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * Teksten i feltet, som `get_field_text` i skjemaet: en liste uten id gir
 * avsnittene med tom linje mellom, emneknaggene gis med mellomrom. Null for
 * ukjent sti, eller naar kanalen, feltet eller avsnittet ikke finnes.
 */
export function getFieldText(channels: ListingTextChannels, path: string): string | null {
  const fp = parseFieldPath(path);
  if (fp === null) return null;
  const channel = channelRecord(channels, fp.channel);
  if (channel === null) return null;
  const value = channel[typedName(fp.field)];
  if (value === null || value === undefined) return null;
  switch (fp.kind) {
    case "text":
      return (value as TextField).text;
    case "plain":
      return value as string;
    case "tags":
      return (value as string[]).join(" ");
    case "items": {
      const items = value as TextItem[];
      if (fp.itemId === null) return items.map((item) => item.text).join("\n\n");
      return items.find((item) => item.id === fp.itemId)?.text ?? null;
    }
  }
}

/**
 * Feltstiene som kan redigeres i pakken, i fast rekkefoelge (som
 * `iter_text_fields`, med emneknaggene som ett felt). Avsnitt og hoeydepunkter
 * gis hver for seg.
 */
export function editableFieldPaths(channels: ListingTextChannels): string[] {
  const out: string[] = [];
  for (const channel of CHANNELS) {
    const rec = channelRecord(channels, channel);
    if (rec === null) continue;
    for (const [field, kind] of Object.entries(FIELD_TYPES[channel]) as [string, FieldKind][]) {
      const base = `${channel}.${field}`;
      if (NOT_EDITABLE.has(base)) continue;
      const value = rec[typedName(field)];
      if (value === null || value === undefined) continue;
      if (kind === "items") {
        for (const item of value as TextItem[]) out.push(`${base}.${item.id}`);
      } else {
        out.push(base);
      }
    }
  }
  return out;
}

/**
 * «Kopier» for et felt (`finn.body`, `social.post` …): `copy_text` fra backend
 * (K §9.3 punkt 5), aldri satt sammen her, saa kopi og eksport blir like. Null
 * naar backend ikke sendte den, eller for ett enkelt avsnitt.
 */
export function copyTextFor(channels: ListingTextChannels, path: string): string | null {
  const fp = parseFieldPath(path);
  if (fp === null || fp.itemId !== null) return null;
  const channel = channels[fp.channel];
  if (channel === null) return null;
  return Object.hasOwn(channel.copyText, fp.field) ? channel.copyText[fp.field] : null;
}

// --- teller og lengdemaal (K §5, listing_text_checks.py) ---------------------

/**
 * Mellomrom som Pythons `str.split()` uten argument: ogsaa U+00A0 og U+202F
 * (tusenskillet), men ikke U+FEFF, som JavaScripts `\s` tar med.
 */
const PY_WHITESPACE = /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/;

/** Ord telles paa mellomrom etter NFC, som `count_words`: «3-roms» er ett ord. */
export function countWords(value: string): number {
  return value.normalize("NFC").split(PY_WHITESPACE).filter((w) => w.length > 0).length;
}

/**
 * Tegn etter NFC, som `count_chars`: «å» skrevet som a + ring (NFD fra macOS)
 * er ett tegn. Kodepunkter, ikke UTF-16-enheter, som `len()` i Python.
 */
export function countChars(value: string): number {
  return [...value.normalize("NFC")].length;
}

export type LengthUnit = "chars" | "words" | "items";

/** Maalene per felt (K §5, `LENGTH_TARGETS`): [enhet, min, maks]. Aldri en sperre. */
export const LENGTH_TARGETS = {
  "finn.headline": ["chars", 50, 90],
  "finn.intro": ["words", 80, 120],
  "finn.body": ["words", 180, 350],
  "finn.highlights": ["items", 4, 6],
  "finn.neighbourhood": ["words", 80, 150],
  "social.post": ["words", 40, 90],
  "social.hashtags": ["items", 0, 3],
  "email.subject": ["chars", 35, 55],
  "email.preheader": ["chars", 60, 90],
  "email.body": ["words", 80, 150],
} as const satisfies Record<string, readonly [LengthUnit, number, number]>;

export type LengthPath = keyof typeof LENGTH_TARGETS;

/** Hovedteksten for komplekse boliger (K §5). */
export const BODY_WORDS_COMPLEX = [350, 600] as const;

/** Overskrift over dette er `material` (`headline_too_long`). */
export const HEADLINE_HARD_MAX = 120;

/**
 * Taket per tekstfelt ved lagring (`TEXT_MAX_CHARS` i skjemaet). Over taket
 * gir `400 invalid_listing_text`. `finn.body` og `finn.highlights` gjelder
 * per avsnitt og hoeydepunkt.
 */
export const TEXT_MAX_CHARS = {
  "finn.headline": 300,
  "finn.intro": 2000,
  "finn.body": 3000,
  "finn.highlights": 200,
  "finn.neighbourhood": 2000,
  "social.post": 1500,
  "social.fact_line": 300,
  "email.subject": 200,
  "email.preheader": 250,
  "email.body": 2500,
  "email.signature": 500,
} as const;

export interface LengthCheck {
  unit: LengthUnit;
  value: number;
  min: number;
  max: number;
  /** `too_long` bare for overskriften over HEADLINE_HARD_MAX. */
  status: "short" | "ok" | "long" | "too_long";
}

/** Maalt verdi mot maalet for feltet, som `check_lengths`. */
export function checkLength(path: LengthPath, value: number, opts: { complexProperty?: boolean } = {}): LengthCheck {
  const [unit, lo, hi] = LENGTH_TARGETS[path];
  const [min, max] = path === "finn.body" && opts.complexProperty ? BODY_WORDS_COMPLEX : [lo, hi];
  let status: LengthCheck["status"] = "ok";
  if (path === "finn.headline" && value > HEADLINE_HARD_MAX) status = "too_long";
  else if (value < min) status = "short";
  else if (value > max) status = "long";
  return { unit, value, min, max, status };
}

/**
 * Lengdene i pakken, som `_measure`: hovedteksten er summen av avsnittene,
 * hoeydepunktene og emneknaggene telles som antall.
 */
export function measureChannels(channels: ListingTextChannels): Partial<Record<LengthPath, number>> {
  const m: Partial<Record<LengthPath, number>> = {};
  const { finn, social, email } = channels;
  if (finn) {
    m["finn.headline"] = countChars(finn.headline.text);
    m["finn.intro"] = countWords(finn.intro.text);
    m["finn.body"] = finn.body.reduce((n, p) => n + countWords(p.text), 0);
    m["finn.highlights"] = finn.highlights.length;
    if (finn.neighbourhood !== null) m["finn.neighbourhood"] = countWords(finn.neighbourhood.text);
  }
  if (social) {
    m["social.post"] = countWords(social.post.text);
    m["social.hashtags"] = social.hashtags.length;
  }
  if (email) {
    m["email.subject"] = countChars(email.subject.text);
    m["email.preheader"] = countChars(email.preheader.text);
    m["email.body"] = countWords(email.body.text);
  }
  return m;
}

// --- API-kall ----------------------------------------------------------------

/**
 * Feil fra tekst-endepunktene (K §7): `code` fra `detail.code`, ellers null
 * (404 med `detail: "not found"`). `retryAfter` er sekundene i `Retry-After`
 * (429). `httpStatus` 0 betyr at kallet aldri ble sendt (ugyldig feltsti).
 * Teksten kommer fra ordlista (`listingTextError`), aldri herfra.
 */
export class ListingTextError extends Error {
  readonly httpStatus: number;
  readonly code: string | null;
  readonly detail: Record<string, unknown>;
  readonly retryAfter: number | null;

  constructor(httpStatus: number, code: string | null, detail: Record<string, unknown> = {}, retryAfter: number | null = null) {
    super(`listing-text failed (${httpStatus})${code ? `: ${code}` : ""}`);
    this.name = "ListingTextError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }
}

/**
 * Koden til ordlista (`listingTextError`): `detail.code` fra backend,
 * `not_found` for 404 uten kode (flagget av, ikke din ordre),
 * `listing_text_unavailable` for 503 uten kode, ellers `http_<status>`.
 * Alt som ikke er et svar fra backend (nett, token), er `network`.
 */
export function listingTextErrorCode(err: unknown): string {
  if (!(err instanceof ListingTextError)) return "network";
  if (err.code !== null) return err.code;
  if (err.httpStatus === 404) return "not_found";
  if (err.httpStatus === 503) return "listing_text_unavailable";
  return `http_${err.httpStatus}`;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function retryAfterSeconds(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (raw === null || !/^\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

async function errorFrom(res: Response): Promise<ListingTextError> {
  const body = await readJson(res);
  const detail = isRecord(body) && isRecord(body.detail) ? body.detail : {};
  return new ListingTextError(res.status, str(detail.code), detail, retryAfterSeconds(res));
}

async function expectJson(res: Response, ok: number): Promise<unknown> {
  if (res.status !== ok) throw await errorFrom(res);
  return readJson(res);
}

function jsonInit(method: string, body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) };
}

function textPath(id: string): string {
  return `/v1/assignments/${encodeURIComponent(id)}/listing-text`;
}

function documentPath(id: string, documentId: string): string {
  return `${textPath(id)}/documents/${encodeURIComponent(documentId)}`;
}

function required<T>(value: T | null, what: string): T {
  if (value === null) throw new ListingTextError(200, "invalid_response", { field: what });
  return value;
}

async function expectPackage(res: Response, ok: number): Promise<ListingText> {
  return required(parseListingText(await expectJson(res, ok)), "listing_text");
}

/**
 * GET …/listing-text (K §5). Uten grunnlaget som standard (K §9.3 punkt 2):
 * `includeBasis` bare naar «Se grunnlag» aapnes, eller én gang naar pakken er
 * ferdig. `version` gir en eldre versjon.
 */
export async function getListingText(
  request: AssignmentRequest,
  id: string,
  opts: { includeBasis?: boolean; version?: number } = {}
): Promise<ListingText> {
  const query = new URLSearchParams();
  if (opts.version !== undefined) query.set("version", String(opts.version));
  if (opts.includeBasis) query.set("include", "basis");
  const qs = query.toString();
  const res = await request(`${textPath(id)}${qs ? `?${qs}` : ""}`, { method: "GET" });
  return expectPackage(res, 200);
}

/**
 * POST …/listing-text/documents (K §2): start opplastingen av én PDF. Samme
 * `idempotencyKey` gir samme dokument og en ny lenke («Last opp paa nytt»).
 * Selve opplastingen til `upload.signedUrl` kommer i T2.
 */
export async function startListingTextDocument(
  request: AssignmentRequest,
  opts: { id: string; fileName: string; bytes: number; idempotencyKey?: string }
): Promise<DocumentUploadStart> {
  const headers: Record<string, string> = {};
  if (opts.idempotencyKey !== undefined) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await request(
    `${textPath(opts.id)}/documents`,
    jsonInit("POST", { file_name: opts.fileName, bytes: opts.bytes, content_type: DOCUMENT_CONTENT_TYPE }, headers)
  );
  return required(parseDocumentUploadStart(await expectJson(res, 201)), "document");
}

/** POST …/documents/{document_id}/complete (K §2): `ready`, eller `rejected` med `rejectCode`. */
export async function completeListingTextDocument(
  request: AssignmentRequest,
  opts: { id: string; documentId: string }
): Promise<ListingTextDocument> {
  const res = await request(`${documentPath(opts.id, opts.documentId)}/complete`, { method: "POST" });
  const body = await expectJson(res, 200);
  return required(parseDocument(isRecord(body) ? body.document : null), "document");
}

/** DELETE …/documents/{document_id} (K §2): 204. */
export async function deleteListingTextDocument(
  request: AssignmentRequest,
  opts: { id: string; documentId: string }
): Promise<void> {
  const res = await request(documentPath(opts.id, opts.documentId), { method: "DELETE" });
  if (res.status !== 204) throw await errorFrom(res);
}

/** Kroppen i bestillingen og «Lag paa nytt» (K §3). Alt er valgfritt. */
export interface ListingTextOrder {
  note?: string;
  documentIds?: string[];
  imageIds?: string[];
}

/** Kroppen slik backend vil ha den. Tomme felt er ikke med (da gjelder standarden i K §3). */
export function orderWireBody(order: ListingTextOrder): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (order.note !== undefined && order.note.trim().length > 0) body.note = order.note;
  if (order.documentIds !== undefined) body.document_ids = order.documentIds;
  if (order.imageIds !== undefined) body.image_ids = order.imageIds;
  return body;
}

export type OrderRoute = "order" | "regenerate";

/**
 * Det som avgjoer noekkelen for et kall (`CallKeys.keyFor` i orderStart.ts,
 * FE-3): ruten, ordren og kroppen. Samme kall paa nytt etter nettfeil gir
 * samme noekkel; alt annet er en ny bestilling med ny noekkel.
 */
export function orderCallSignature(route: OrderRoute, id: string, order: ListingTextOrder): string {
  return JSON.stringify([route, id, orderWireBody(order)]);
}

async function postOrder(
  request: AssignmentRequest,
  path: string,
  opts: { order: ListingTextOrder; idempotencyKey: string; signal?: AbortSignal }
): Promise<ListingText> {
  const res = await request(path, {
    ...jsonInit("POST", orderWireBody(opts.order), { "Idempotency-Key": opts.idempotencyKey }),
    signal: opts.signal,
  });
  return expectPackage(res, 202);
}

/**
 * POST …/listing-text (K §3): bestill tekstpakken. `Idempotency-Key` er
 * paakrevd; ny for hver bestilling, samme bare ved nytt forsoek med samme kropp
 * (`orderCallSignature`). 202 gir pakken med `processing`.
 */
export async function orderListingText(
  request: AssignmentRequest,
  opts: { id: string; order: ListingTextOrder; idempotencyKey: string; signal?: AbortSignal }
): Promise<ListingText> {
  return postOrder(request, textPath(opts.id), opts);
}

/** POST …/listing-text/regenerate («Lag paa nytt», K §3): som bestillingen. */
export async function regenerateListingText(
  request: AssignmentRequest,
  opts: { id: string; order: ListingTextOrder; idempotencyKey: string; signal?: AbortSignal }
): Promise<ListingText> {
  return postOrder(request, `${textPath(opts.id)}/regenerate`, opts);
}

/**
 * POST …/listing-text/versions (K §4): lagre redigeringen som ny versjon.
 * Noeklene i `fields` maa vaere feltstier som kan redigeres; ellers sendes
 * ingenting (`ListingTextError` 0 `invalid_listing_text` med `field`). Tom
 * tekst fjerner et avsnitt eller hoeydepunkt (K §9.3 punkt 4).
 */
export async function saveListingTextVersion(
  request: AssignmentRequest,
  opts: { id: string; baseVersion: number; baseSha256: string; fields: Record<string, string> }
): Promise<ListingText> {
  for (const path of Object.keys(opts.fields)) {
    if (!isEditableFieldPath(path)) throw new ListingTextError(0, "invalid_listing_text", { field: path });
  }
  const res = await request(
    `${textPath(opts.id)}/versions`,
    jsonInit("POST", { base_version: opts.baseVersion, base_sha256: opts.baseSha256, fields: opts.fields })
  );
  return expectPackage(res, 201);
}

/** POST …/listing-text/approve (K §4): idempotent for samme versjon og hash. */
export async function approveListingText(
  request: AssignmentRequest,
  opts: { id: string; version: number; contentSha256: string }
): Promise<ListingText> {
  const res = await request(
    `${textPath(opts.id)}/approve`,
    jsonInit("POST", { version: opts.version, content_sha256: opts.contentSha256 })
  );
  return expectPackage(res, 200);
}

/** GET /v1/office-profile (K §1): standardverdiene med `isDefault` uten lagret profil. */
export async function getOfficeProfile(request: AssignmentRequest): Promise<OfficeProfile> {
  const res = await request("/v1/office-profile", { method: "GET" });
  return required(parseOfficeProfile(await expectJson(res, 200)), "office_profile");
}

/** Innstillingene slik backend vil ha dem (K §1). */
export function officeProfileWire(settings: OfficeProfileSettings): Record<string, unknown> {
  return {
    schema_version: settings.schemaVersion,
    style: settings.style,
    address_form: settings.addressForm,
    avoid_words: settings.avoidWords,
    email_signature: settings.emailSignature,
    email_cta: settings.emailCta,
    channels: settings.channels,
  };
}

/** PUT /v1/office-profile (K §1): `version` er den man redigerte fra. 409 version_conflict ved eldre. */
export async function putOfficeProfile(
  request: AssignmentRequest,
  opts: { version: number; settings: OfficeProfileSettings }
): Promise<OfficeProfile> {
  const res = await request(
    "/v1/office-profile",
    jsonInit("PUT", { version: opts.version, settings: officeProfileWire(opts.settings) })
  );
  return required(parseOfficeProfile(await expectJson(res, 200)), "office_profile");
}

/**
 * Stien til eksporten som tekst (K §6), relativ til API_BASE. Hentes med
 * `request` (innlogget) og lagres med saveBlob i T3. Kanalene i fast
 * rekkefoelge; uten `channels` alle tre.
 */
export function listingTextExportPath(id: string, opts: { version: number; channels?: readonly Channel[] }): string {
  const wanted = opts.channels ?? CHANNELS;
  const channels = CHANNELS.filter((c) => wanted.includes(c));
  const query = new URLSearchParams({ version: String(opts.version), format: "txt", channels: channels.join(",") });
  return `${textPath(id)}/export?${query.toString().replace(/%2C/g, ",")}`;
}
