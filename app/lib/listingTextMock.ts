import type { AssignmentRequest } from "./assignments.ts";
import type { UploadXhr, XhrFactory } from "./documentUpload.ts";
import { countWords, RUN_STEPS } from "./listingText.ts";
import type { PdfTab } from "./listingTextPackage.ts";
import { formatNorwegianNumber, PROPERTY_KEYS, PROPERTY_SPECS, type PropertyWire } from "./listingTextProperty.ts";

/**
 * Mock-modusen for annonseteksten (TG-NEW-281, T2; K §9.3 punkt 10, valg b):
 * en falsk backend og en falsk XHR, saa siden kan sees lokalt foer backend 1b
 * er i drift. Bare i `next dev` med `?mock=1`: modulen lastes med `import()`
 * inne i `process.env.NODE_ENV === "development"`, saa prod-bygget tar den
 * ikke med (testen ser etter MOCK_MARKER i bygget).
 *
 * Ingen kall gaar ut: ordren, bildene, pakken og opplastingen er falske, og
 * ingenting sendes til backend eller Supabase.
 *
 * T3: etter «Behandles» gir mock en full pakke for en oppdiktet bolig
 * (Mockveien 1, 0000 Oslo), med grunnlaget bare ved `include=basis`, og
 * `documents/{d}/url` gir en `mock://`-lenke som aldri aapnes. Ingen tekst er
 * hentet fra ekte salgsoppgaver.
 *
 * K §10: bestillingen tar `property` (Boligfakta). Ukjente noekler gir `400
 * invalid_listing_text` med `field: property.<noekkel>`, og fargen i
 * energimerket uten bokstaven gir det samme (K §10.7). Det lagrede kommer
 * tilbake i GET, og hvert felt blir et faktum `p1`, `p2` … med kilden
 * `{"form": true}` i grunnlaget (utenom `target_group`).
 */

/** Staar bare i denne modulen. Testen sjekker at strengen ikke finnes i prod-bygget. */
export const MOCK_MARKER = "listing-text-mock-marker-v1";

const LATENCY_MS = 300;
/** Opplastingen: 5 % hvert 150. millisekund (3 s per fil). */
const PROGRESS_STEP = 5;
const PROGRESS_MS = 150;

const ROOMS = ["Stue", "Kjøkken", "Soverom", "Bad", "Uteplass", "Gang"];
const COLORS = ["#c9b79c", "#9fb4c7", "#b9c9a3", "#d6c2d9", "#a7c4bc", "#e0c9a6"];

function thumb(i: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="107"><rect width="160" height="107" fill="${COLORS[i % COLORS.length]}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MockDoc {
  id: string;
  file_name: string;
  bytes: number;
  status: "pending" | "ready" | "rejected";
  reject_code: string | null;
  key: string | null;
}

export interface ListingTextMock {
  request: AssignmentRequest;
  xhr: XhrFactory;
  /** Mock aapner ingen fane (siden viser en melding i stedet). */
  openTab: () => PdfTab | null;
}

// --- den oppdiktede pakken (T3) ----------------------------------------------

/** Dokumentene grunnlaget viser til. Arealmaalingen gir 404 paa lenken, som for admin. */
const MOCK_DOCS = [
  { id: "mock_doc_sp", file_name: "Salgsoppgave_Mockveien_1.pdf", kind: "sales_prospectus", pages: 48 },
  { id: "mock_doc_tr", file_name: "Tilstandsrapport_Mockveien_1.pdf", kind: "condition_report", pages: 18 },
  { id: "mock_doc_area", file_name: "Arealmaaling_Mockveien_1.pdf", kind: "area_report", pages: 3 },
] as const;
const MOCK_URL_404 = "mock_doc_area";

const doc = (id: string, kind: string, page: number) => ({ document_id: id, document_kind: kind, page, excerpt: null });
const sp = (page: number) => doc("mock_doc_sp", "sales_prospectus", page);

const MOCK_FACTS = [
  { id: "f1", field: "location", label: "Sted", value_text: "Mockbyen, Oslo", kind: "document", source: sp(2), material: false },
  { id: "f2", field: "property_type", label: "Boligtype", value_text: "Leilighet (borettslag)", kind: "document", source: sp(2), material: false },
  { id: "f3", field: "bra_i", label: "BRA-i", value_text: "68 m²", value: 68, unit: "m2", kind: "document", source: sp(4), material: false },
  { id: "f4", field: "bra_i", label: "BRA-i", value_text: "66 m²", value: 66, unit: "m2", kind: "document", source: doc("mock_doc_area", "area_report", 1), material: false },
  { id: "f5", field: "bedrooms", label: "Soverom", value_text: "2", value: 2, kind: "document", source: sp(4), material: false },
  { id: "f6", field: "asking_price", label: "Prisantydning", value_text: "kr 4 900 000", value: 4900000, unit: "NOK", kind: "document", source: sp(3), material: false },
  { id: "f7", field: "costs", label: "Omkostninger", value_text: "kr 125 000", value: 125000, unit: "NOK", kind: "document", source: sp(3), material: false },
  { id: "f8", field: "common_debt", label: "Andel fellesgjeld", value_text: "kr 350 000", value: 350000, unit: "NOK", kind: "document", source: sp(3), material: false },
  { id: "c_total_price", field: "total_price", label: "Totalpris", value_text: "kr 5 375 000", value: 5375000, unit: "NOK", kind: "computed", source: null, inputs: ["f6", "f7", "f8"], material: false },
  { id: "f10", field: "balcony", label: "Balkong", value_text: "Sørvestvendt, 7 m²", kind: "document", source: sp(5), material: false },
  { id: "f11", field: "observation", label: "Synlig i bilde", value_text: "Store vinduer mot sør i stua", kind: "visual", source: { image_id: "mock_img_1", position: 1 }, material: false },
  { id: "f12", field: "observation", label: "Synlig i bilde", value_text: "Åpen løsning mellom kjøkken og stue", kind: "visual", source: { image_id: "mock_img_2", position: 2 }, material: false },
  { id: "f13", field: "kitchen_year", label: "Kjøkken", value_text: "Nytt kjøkken 2023", kind: "broker", source: { note: true }, material: false },
  { id: "f14", field: "condition", label: "Bad", value_text: "TG2: Avvik i ventilasjonen", kind: "document", source: doc("mock_doc_tr", "condition_report", 9), material: true },
  { id: "f15", field: "condition", label: "Kjellerbod", value_text: "TG3: Fukt i kjellerboden", kind: "document", source: doc("mock_doc_tr", "condition_report", 12), material: true },
  { id: "f16", field: "neighbourhood", label: "Nærmiljø", value_text: "Skole og barnehage i gangavstand", kind: "document", source: sp(7), material: false },
  { id: "f17", field: "heating", label: "Oppvarming", value_text: "Fjernvarme, inkludert i felleskostnadene", kind: "document", source: sp(6), material: false },
  { id: "f18", field: "common_costs", label: "Felleskostnader", value_text: "kr 4 250 per måned", value: 4250, unit: "NOK", kind: "document", source: sp(3), material: false },
];

const NEIGHBOURHOOD = "Mockbyen er et rolig boligområde med skole, barnehage og butikk i gangavstand. Bussen går ofte til sentrum.";

const MOCK_CONTENT = {
  finn: {
    headline: { text: "Lys 3-roms med sørvestvendt balkong og nytt kjøkken i Mockbyen", fact_ids: ["f10", "f13", "f1"] },
    intro: {
      text:
        "Velkommen til en lys og romslig 3-roms leilighet i et rolig borettslag i Mockbyen. Stua har store vinduer mot sør, " +
        "og den åpne løsningen mot kjøkkenet gir god plass til både hverdag og besøk. Kjøkkenet er nytt fra 2023. Fra stua " +
        "går du ut på en sørvestvendt balkong på 7 m², med plass til bord og stoler. Leiligheten har to soverom og 68 m² " +
        "BRA-i. Skole og barnehage ligger i gangavstand.",
      fact_ids: ["f11", "f12", "f13", "f10", "f5", "f3", "f16"],
    },
    body: [
      {
        id: "p1",
        text:
          "Leiligheten ligger i andre etasje i et godt vedlikeholdt borettslag. Entreen har plass til yttertøy og sko, og " +
          "herfra når du alle rommene. Stua er lys, med store vinduer mot sør og god plass til sofagruppe og spisebord. Den " +
          "åpne løsningen mot kjøkkenet gjør rommet både sosialt og praktisk i hverdagen.",
        fact_ids: ["f11", "f12"],
        check: "supported",
      },
      {
        id: "p2",
        text:
          "Kjøkkenet ble skiftet ut i 2023 og har god benkeplass, integrerte hvitevarer og plass til et lite spisebord ved " +
          "vinduet. Fra stua går du ut på balkongen på 7 m², som vender mot sørvest og har plass til både bord og stoler.",
        fact_ids: ["f13", "f10"],
        check: "supported",
      },
      {
        id: "p3",
        text:
          "Begge soverommene har plass til dobbeltseng, og det største har en romslig garderobe. Badet har dusj, toalett og " +
          "opplegg for vaskemaskin. Leiligheten varmes opp med fjernvarme, som er inkludert i felleskostnadene på kr 4 250 " +
          "per måned.",
        fact_ids: ["f5", "f17", "f18"],
        check: "partial",
      },
      {
        id: "p4",
        text:
          "Borettslaget har felles vaskeri, sykkelbod og en stor felles hage med lekeplass. Hver leilighet har sin egen " +
          "kjellerbod. Det er kort vei til butikk og buss, og skole og barnehage ligger i gangavstand. Totalprisen er " +
          "kr 5 375 000, med andel fellesgjeld. Området har flere turstier og en liten park, og det er bare noen minutter å " +
          "gå til nærmeste holdeplass.",
        fact_ids: ["f16", "c_total_price"],
        check: "supported",
      },
      {
        id: "p5",
        text:
          "Verdt å vite: Det er påvist fukt i kjellerboden (TG3), og ventilasjonen på badet har avvik (TG2). Energimerket er " +
          "ikke oppgitt. Tilstandsrapporten har detaljene.",
        fact_ids: ["f14", "f15"],
        check: "supported",
      },
    ],
    highlights: [
      { id: "h1", text: "Sørvestvendt balkong på 7 m²", fact_ids: ["f10"], check: "supported" },
      { id: "h2", text: "Nytt kjøkken fra 2023", fact_ids: ["f13"], check: "supported" },
      { id: "h3", text: "To soverom og 68 m² BRA-i", fact_ids: ["f5", "f3"], check: "supported" },
      { id: "h4", text: "Fjernvarme inkludert i felleskostnadene", fact_ids: ["f17"], check: "supported" },
      { id: "h5", text: "Felles hage med lekeplass", fact_ids: [], check: "partial" },
    ],
    neighbourhood: { text: NEIGHBOURHOOD, fact_ids: ["f16"] },
  },
  social: {
    post: {
      text:
        "Lys 3-roms med sørvestvendt balkong og nytt kjøkken fra 2023! Bildene viser en stue med store vinduer mot sør og en " +
        "åpen løsning mot kjøkkenet. Leiligheten har to soverom og ligger i et rolig borettslag med felles hage. Skole og " +
        "barnehage ligger i gangavstand. Se hele annonsen, og meld deg på visning.",
      fact_ids: ["f10", "f13", "f11", "f12", "f5", "f16"],
    },
    fact_line: {
      text: "kr 5 375 000 · Mockbyen, Oslo · Leilighet (borettslag) · 68 m² BRA-i · 2 soverom · Energimerke mangler",
      fact_ids: ["c_total_price", "f1", "f2", "f3", "f5"],
    },
    hashtags: ["#mockbyen", "#oslo", "#nyttkjøkken"],
  },
  email: {
    subject: { text: "Ny i salg: lys 3-roms med balkong i Mockbyen", fact_ids: ["f1"] },
    preheader: { text: "Nytt kjøkken fra 2023, to soverom og sørvestvendt balkong på 7 m².", fact_ids: ["f13", "f5", "f10"] },
    body: {
      text:
        "Hei!\n\nVi har en ny bolig i salg som kanskje passer for deg. Leiligheten i Mockveien 1 er en lys 3-roms på 68 m² " +
        "BRA-i, med to soverom og sørvestvendt balkong på 7 m². Kjøkkenet er nytt fra 2023, og stua har store vinduer mot " +
        "sør.\n\nBorettslaget har felles hage med lekeplass, og skole og barnehage ligger i gangavstand. Fjernvarme er " +
        "inkludert i felleskostnadene.\n\nKjellerboden har en fuktskade. Se hele annonsen for alle detaljer, og meld deg " +
        "på visning. Vi svarer gjerne på spørsmål før visningen, på telefon eller e-post.",
      fact_ids: ["f3", "f5", "f10", "f13", "f16", "f17", "f15"],
    },
    signature: "Mock Megler\nEiendomsmegler\nMockmegling AS",
  },
};

/** «Kopier» som backend lager den (`copy_texts`): avsnitt med tom linje, «• » per hoeydepunkt, knaggene til slutt. */
function mockCopyTexts() {
  const { finn, social, email } = MOCK_CONTENT;
  const tags = social.hashtags.join(" ");
  return {
    finn: {
      headline: finn.headline.text,
      intro: finn.intro.text,
      body: finn.body.map((p) => p.text).join("\n\n"),
      highlights: finn.highlights.map((h) => `• ${h.text}`).join("\n"),
      neighbourhood: finn.neighbourhood.text,
    },
    social: { post: `${social.post.text}\n\n${tags}`, fact_line: social.fact_line.text, hashtags: tags },
    email: {
      subject: email.subject.text,
      preheader: email.preheader.text,
      body: email.body.text,
      signature: email.signature,
    },
  };
}

function mockChannels() {
  const copy = mockCopyTexts();
  return {
    finn: { ...MOCK_CONTENT.finn, copy_text: copy.finn },
    social: { ...MOCK_CONTENT.social, copy_text: copy.social },
    email: { ...MOCK_CONTENT.email, copy_text: copy.email },
  };
}

const MOCK_KEY_FACTS = [
  { key: "total_price", status: "found", value_text: "kr 5 375 000", fact_ids: ["c_total_price"] },
  { key: "location", status: "found", value_text: "Mockbyen, Oslo", fact_ids: ["f1"] },
  { key: "property_type", status: "found", value_text: "Leilighet (borettslag)", fact_ids: ["f2"] },
  { key: "bra_i", status: "conflict", value_text: "68 m² / 66 m²", fact_ids: ["f3", "f4"] },
  { key: "bedrooms", status: "found", value_text: "2", fact_ids: ["f5"] },
  { key: "energy_label", status: "missing", value_text: null, fact_ids: [] },
];

/** Avvikene: `length_outside_target` (info) foerst, saa sorteringen i siden synes. */
function mockIssues() {
  const n = countWords(NEIGHBOURHOOD);
  return [
    {
      id: "i3",
      code: "length_outside_target",
      severity: "info",
      message: `${n} ord; målet er 50–120 ord.`,
      suggestion: "Utvid litt hvis det finnes mer å si.",
      fact_ids: [],
      fields: ["finn.neighbourhood"],
    },
    {
      id: "i1",
      code: "meta_reference",
      severity: "material",
      message: "Teksten viser til kildene i stedet for boligen.",
      suggestion: "Skriv om boligen direkte, uten å nevne bildene.",
      fact_ids: [],
      fields: ["social.post"],
    },
    {
      id: "i2",
      code: "conflicting_bra_i",
      severity: "material",
      message: "BRA-i er 68 m² i salgsoppgaven og 66 m² i arealmålingen.",
      suggestion: "Bruk tallet fra salgsoppgaven, eller rett det ene dokumentet.",
      fact_ids: ["f3", "f4"],
      fields: ["finn.intro", "finn.highlights.h3"],
    },
  ];
}

/** Boligfakta som fakta (K §10.2): `p1`, `p2` … med `source: {form: true}`, uten `target_group`. Enkel visning, bare for mock. */
function propertyFacts(property: PropertyWire | null) {
  if (property === null) return [];
  const out: Record<string, unknown>[] = [];
  for (const key of PROPERTY_KEYS) {
    const value = property[key];
    if (value === undefined || key === "target_group") continue;
    const spec = PROPERTY_SPECS[key];
    const text = typeof value === "number" ? formatNorwegianNumber(value, spec.kind === "number" && spec.group) : value;
    out.push({ id: `p${out.length + 1}`, field: key === "address" ? "location" : key, label: key, value_text: text, kind: "broker", source: { form: true }, material: false });
  }
  return out;
}

const MOCK_BASIS = {
  schema_version: 1,
  facts: MOCK_FACTS,
  plan: { angle: "outdoor_living", qualities: [{ text: "Sørvestvendt balkong", fact_ids: ["f10"] }], must_include: ["f14", "f15"], unknowns: ["energy_label"] },
  issues: [
    {
      id: "b1",
      code: "conflicting_bra_i",
      severity: "material",
      message: "BRA-i er ulikt i salgsoppgaven og arealmålingen.",
      suggestion: null,
      fact_ids: ["f3", "f4"],
      fields: [],
    },
  ],
};

/**
 * En ny falsk backend for én ordre. Pakken gaar gjennom de fem trinnene, ett
 * trinn per henting etter bestillingen, og blir saa `to_review`. En fil med
 * «avvist» i navnet blir `rejected` (`not_pdf`) ved `complete`.
 */
export function createListingTextMock(assignmentId: string, opts: { latencyMs?: number } = {}): ListingTextMock {
  const latency = opts.latencyMs ?? LATENCY_MS;
  const now = new Date().toISOString();
  const docs: MockDoc[] = [];
  let nextDoc = 1;
  let status: "not_ordered" | "processing" | "to_review" = "not_ordered";
  let stepIndex = 0;
  let note: string | null = null;
  let property: PropertyWire | null = null;
  const orderKeys = new Set<string>();

  const assignment = {
    id: assignmentId,
    address: "Mockveien 1, 0000 Oslo",
    assignment_no: "MOCK-1",
    created_at: now,
    updated_at: now,
    counts: { images: ROOMS.length, results: 0 },
    images: ROOMS.map((room, i) => ({
      id: `mock_img_${i + 1}`,
      position: i + 1,
      room,
      file_name: `IMG_${4810 + i}.jpg`,
      width: 1500,
      height: 1000,
      thumb_url: thumb(i),
      original_url: thumb(i),
      display_status: null,
      results: [],
    })),
  };

  const wireDoc = (d: MockDoc) => ({
    id: d.id,
    file_name: d.file_name,
    bytes: d.bytes,
    status: d.status,
    kind: null,
    pages: null,
    reject_code: d.reject_code,
    used_in_version: false,
    created_at: now,
  });

  const pkg = (includeBasis = false) => {
    const processing = status === "processing";
    const ready = status === "to_review";
    return {
      assignment_id: assignmentId,
      display_status: status,
      version: status === "to_review" ? 1 : null,
      versions: status === "to_review" ? [{ version: 1, source: "generated", created_at: now }] : [],
      last_run: status === "not_ordered"
        ? null
        : {
            id: "mock_run_1",
            kind: "order",
            status: processing ? "running" : "succeeded",
            step: processing ? RUN_STEPS[stepIndex] : null,
            error_code: null,
            created_at: now,
            updated_at: new Date().toISOString(),
          },
      documents: ready
        ? [
            ...MOCK_DOCS.map((d) => ({ ...d, bytes: 2_000_000, status: "ready", reject_code: null, used_in_version: true, created_at: now })),
            ...docs.map(wireDoc),
          ]
        : docs.map(wireDoc),
      note,
      property,
      key_facts: ready ? MOCK_KEY_FACTS : [],
      issues: ready ? mockIssues() : [],
      channels: ready ? mockChannels() : null,
      basis: ready && includeBasis ? { ...MOCK_BASIS, facts: [...MOCK_BASIS.facts, ...propertyFacts(property)] } : null,
      limits: { daily_runs: 10, runs_left_today: 9 },
      media_deleted_at: null,
      created_at: now,
      updated_at: new Date().toISOString(),
    };
  };

  const base = `/v1/assignments/${encodeURIComponent(assignmentId)}`;
  const text = `${base}/listing-text`;

  const request: AssignmentRequest = async (path, init) => {
    await wait(latency);
    const method = init.method ?? "GET";
    const [url, qs = ""] = path.split("?");
    const query = new URLSearchParams(qs);
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const headers = new Headers(init.headers);

    if (method === "GET" && url === base) return json(200, assignment);
    if (method === "GET" && url === text) {
      if (status === "processing") {
        if (stepIndex < RUN_STEPS.length - 1) stepIndex++;
        else status = "to_review";
      }
      return json(200, pkg(query.get("include") === "basis"));
    }
    const docUrl = url.match(/\/documents\/([^/]+)\/url$/);
    if (method === "GET" && docUrl !== null) {
      const id = decodeURIComponent(docUrl[1]);
      const known = MOCK_DOCS.some((d) => d.id === id) || docs.some((d) => d.id === id && d.status === "ready");
      if (!known || id === MOCK_URL_404) return json(404, { detail: "not found" });
      return json(200, { url: `mock://document/${id}` });
    }
    if (method === "POST" && url === `${text}/documents`) {
      const live = docs.length;
      if (live >= 10) return json(409, { detail: { code: "document_limit", limit: 10 } });
      const key = headers.get("Idempotency-Key");
      let doc = key === null ? undefined : docs.find((d) => d.key === key);
      if (doc === undefined) {
        doc = {
          id: `mock_doc_${nextDoc++}`,
          file_name: String(body.file_name ?? ""),
          bytes: Number(body.bytes ?? 0),
          status: "pending",
          reject_code: null,
          key,
        };
        docs.push(doc);
      }
      return json(201, {
        document: wireDoc(doc),
        upload: {
          signed_url: `mock://upload/${doc.id}?token=mock`,
          token: "mock",
          path: `${assignmentId}/${doc.id}.pdf`,
          expires_at: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        },
      });
    }
    const complete = url.match(/\/documents\/([^/]+)\/complete$/);
    if (method === "POST" && complete !== null) {
      const doc = docs.find((d) => d.id === decodeURIComponent(complete[1]));
      if (doc === undefined) return json(404, { detail: "not found" });
      if (doc.file_name.toLowerCase().includes("avvist")) {
        doc.status = "rejected";
        doc.reject_code = "not_pdf";
      } else {
        doc.status = "ready";
      }
      return json(200, { document: wireDoc(doc) });
    }
    const remove = url.match(/\/documents\/([^/]+)$/);
    if (method === "DELETE" && remove !== null) {
      const i = docs.findIndex((d) => d.id === decodeURIComponent(remove[1]));
      if (i === -1) return json(404, { detail: "not found" });
      docs.splice(i, 1);
      return json(204, null);
    }
    if (method === "POST" && url === text) {
      const key = headers.get("Idempotency-Key");
      if (key === null) return json(400, { detail: { code: "idempotency_key_required" } });
      if (!orderKeys.has(key) && status === "processing") return json(409, { detail: { code: "listing_text_busy" } });
      if (body.property !== undefined && body.property !== null) {
        if (typeof body.property !== "object" || Array.isArray(body.property)) {
          return json(400, { detail: { code: "invalid_listing_text", field: "property" } });
        }
        const unknown = Object.keys(body.property).find((k) => !(PROPERTY_KEYS as readonly string[]).includes(k));
        if (unknown !== undefined) return json(400, { detail: { code: "invalid_listing_text", field: `property.${unknown}` } });
        const sent = body.property as Record<string, unknown>;
        // K §10.7: fargen uten bokstav gir 400.
        if (sent.energy_color != null && sent.energy_letter == null) {
          return json(400, { detail: { code: "invalid_listing_text", field: "property.energy_color" } });
        }
      }
      if (!orderKeys.has(key)) {
        orderKeys.add(key);
        note = typeof body.note === "string" ? body.note : null;
        // Som `note` i backend: mangler noekkelen, beholdes det lagrede; null fjerner det.
        if (body.property !== undefined) property = (body.property as PropertyWire | null) ?? null;
        status = "processing";
        stepIndex = 0;
      }
      return json(202, pkg());
    }
    return json(404, { detail: "not found" });
  };

  return { request, xhr: () => new MockXhr(), openTab: () => null };
}

export { MockXhr };

/** Falsk XHR: fremdrift i steg til 100 %, saa 200 med `Key` som Storage. */
class MockXhr implements UploadXhr {
  readonly marker = MOCK_MARKER;
  status = 0;
  responseText = "";
  readonly upload: UploadXhr["upload"] = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private path = "";

  open(_method: string, url: string): void {
    this.path = url.replace(/^mock:\/\/upload\//, "").split("?")[0];
  }

  setRequestHeader(): void {}

  send(body: Blob): void {
    let percent = 0;
    this.timer = setInterval(() => {
      percent = Math.min(100, percent + PROGRESS_STEP);
      this.upload.onprogress?.({ loaded: (body.size * percent) / 100, total: body.size, lengthComputable: true });
      if (percent >= 100) {
        this.stop();
        this.status = 200;
        this.responseText = JSON.stringify({ Key: `listing-documents/${this.path}` });
        this.onload?.();
      }
    }, PROGRESS_MS);
  }

  abort(): void {
    if (this.timer === null) return;
    this.stop();
    this.onabort?.();
  }

  private stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
