import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  approveListingText,
  checkLength,
  completeListingTextDocument,
  copyTextFor,
  countChars,
  countWords,
  deleteListingTextDocument,
  DOCUMENT_KINDS,
  editableFieldPaths,
  getFieldText,
  getListingText,
  getOfficeProfile,
  isEditableFieldPath,
  KEY_NAMES,
  KEY_STATUSES,
  keyStatusKey,
  LENGTH_TARGETS,
  LISTING_TEXT_STATUSES,
  ListingTextError,
  listingTextErrorCode,
  listingTextExportPath,
  listingTextStatusKey,
  measureChannels,
  orderCallSignature,
  orderListingText,
  parseFieldPath,
  parseListingText,
  parseOfficeProfile,
  putOfficeProfile,
  regenerateListingText,
  RUN_STEPS,
  runStepKey,
  saveListingTextVersion,
  severityKey,
  SEVERITIES,
  sortIssues,
  startListingTextDocument,
  type LengthPath,
  type ListingText,
} from "./listingText.ts";
import { CallKeys } from "./orderStart.ts";
import type { AssignmentRequest } from "./assignments.ts";
import { codeText, DICTIONARIES, t, type CodeGroup } from "./i18n/index.ts";

/**
 * Annonsetekst (TG-NEW-281, T0): parsing, feltstier, teller, lengdemaal og
 * API-kall etter kontraktutkastet (K, §9 foran §0-§8) og
 * listing_text_schema.py. Kallene gaar mot en falsk `request`, saa ingenting
 * sendes til backend.
 */
const SAMPLES = JSON.parse(readFileSync(new URL("./testdata/listing_text_v1.json", import.meta.url), "utf-8")) as Record<
  "to_review" | "processing" | "not_ordered",
  Record<string, unknown>
>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Noden i rå JSON etter sti med punktum (`channels.finn.body.0`). */
function nodeAt(raw: unknown, keys: string[]): Record<string, unknown> {
  let node = raw as Record<string, unknown>;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  return node;
}

/**
 * En kopi av eksempelet med endringene satt inn etter sti. `undefined` sletter
 * feltet; en verdi i `push` legges til i lista.
 */
function edited(changes: Record<string, unknown>, push: Record<string, unknown[]> = {}): Record<string, unknown> {
  const raw = clone(SAMPLES.to_review);
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split(".");
    const parent = nodeAt(raw, keys.slice(0, -1));
    const last = keys[keys.length - 1];
    if (value === undefined) delete parent[last];
    else parent[last] = value;
  }
  for (const [path, values] of Object.entries(push)) {
    (nodeAt(raw, path.split(".")) as unknown as unknown[]).push(...values);
  }
  return raw;
}

function pkg(raw: unknown = SAMPLES.to_review): ListingText {
  const parsed = parseListingText(raw);
  assert.ok(parsed);
  return parsed;
}

// --- parsing -----------------------------------------------------------------

test("K §5: pakken til godkjenning har tre kanaler, nøkkelopplysningene, avvikene og grunnlaget", () => {
  const p = pkg();
  assert.equal(p.assignmentId, "asg_1");
  assert.equal(p.displayStatus, "to_review");
  assert.equal(p.version, 3);
  assert.deepEqual(
    p.versions.map((v) => [v.version, v.source]),
    [
      [1, "generated"],
      [2, "generated"],
      [3, "edited"],
    ]
  );
  assert.equal(p.approved, null);
  assert.deepEqual(p.approvedHistory.map((a) => [a.version, a.byRole]), [[1, "owner"]]);
  assert.equal(p.lastRun?.status, "succeeded");
  assert.equal(p.lastRun?.step, null);
  assert.deepEqual(p.limits, { dailyRuns: 10, runsLeftToday: 7 });
  assert.deepEqual(
    p.documents.map((d) => [d.kind, d.pages, d.status, d.usedInVersion]),
    [
      ["sales_prospectus", 64, "ready", true],
      ["condition_report", 22, "ready", true],
    ]
  );
  assert.equal(p.imagesUsed.length, 8);

  const { finn, social, email } = p.channels ?? { finn: null, social: null, email: null };
  assert.ok(finn && social && email);
  assert.deepEqual(finn.body.map((b) => [b.id, b.check]), [
    ["p1", "supported"],
    ["p2", "partial"],
    ["p3", "supported"],
  ]);
  assert.equal(finn.highlights.length, 4);
  assert.deepEqual(social.hashtags, ["#grünerløkka", "#oslo"]);
  assert.match(email.signature, /^Kari Megler\n/);

  // To avvik (material og info), én mangler og én i motstrid.
  assert.deepEqual(p.issues.map((i) => [i.code, i.severity]), [
    ["conflicting_bra_i", "material"],
    ["length_outside_target", "info"],
  ]);
  assert.equal(p.keyFacts.find((k) => k.status === "missing")?.key, "energy_label");
  assert.equal(p.keyFacts.find((k) => k.status === "conflict")?.key, "bra_i");
  assert.deepEqual(p.keyFacts.map((k) => k.key), [...KEY_NAMES]);
});

test("K §9.2: grunnlaget har fire kind, og den utregnede totalprisen har leddene i inputs", () => {
  const basis = pkg().basis;
  assert.ok(basis);
  assert.equal(basis.schemaVersion, 1);
  assert.deepEqual([...new Set(basis.facts.map((f) => f.kind))].sort(), ["broker", "computed", "document", "visual"]);
  const total = basis.facts.find((f) => f.id === "c_total_price");
  assert.equal(total?.kind, "computed");
  assert.deepEqual(total?.inputs, ["f3", "f4", "f5"]);
  assert.equal(total?.source, null);
  const prices = basis.facts.filter((f) => total?.inputs.includes(f.id)).map((f) => f.value ?? 0);
  assert.equal(prices.reduce((a, b) => a + b, 0), total?.value);
  assert.deepEqual(pkg().keyFacts.find((k) => k.key === "total_price")?.factIds, ["c_total_price"]);
  const page = basis.facts.find((f) => f.id === "f7")?.source;
  assert.deepEqual([page?.documentKind, page?.page], ["sales_prospectus", 4]);
  assert.equal(basis.facts.find((f) => f.kind === "broker")?.source?.note, true);
  assert.equal(basis.facts.find((f) => f.kind === "visual")?.source?.imageId, "img_3");
  assert.equal(basis.plan?.angle, "outdoor_living");
  assert.deepEqual(basis.issues.map((i) => i.code), ["conflicting_bra_i"]);
});

test("K §9.3 punkt 2: uten include=basis er grunnlaget null, resten er likt", () => {
  const p = pkg(edited({ basis: undefined }));
  assert.equal(p.basis, null);
  assert.equal(p.channels?.finn?.headline.text, pkg().channels?.finn?.headline.text);
});

test("processing og not_ordered: de korte svarene", () => {
  const processing = pkg(SAMPLES.processing);
  assert.equal(processing.displayStatus, "processing");
  assert.equal(processing.version, null);
  assert.equal(processing.channels, null);
  assert.equal(processing.lastRun?.status, "running");
  assert.equal(processing.lastRun?.step, "writing");

  const notOrdered = pkg(SAMPLES.not_ordered);
  assert.equal(notOrdered.displayStatus, "not_ordered");
  assert.deepEqual(notOrdered.versions, []);
  assert.equal(notOrdered.lastRun, null);
  assert.deepEqual(notOrdered.keyFacts, []);
  assert.deepEqual(notOrdered.issues, []);
  // K §9.1 punkt 9: kind og pages er null til kjøringen har lest dokumentet.
  assert.deepEqual([notOrdered.documents[0].kind, notOrdered.documents[0].pages], [null, null]);
  assert.deepEqual(notOrdered.limits, { dailyRuns: 10, runsLeftToday: 10 });
  // K §9.1 punkt 4: limits er null for admin og redaktør.
  assert.equal(pkg({ ...SAMPLES.not_ordered, limits: null }).limits, null);
});

test("parsing tåler ukjente felt og ukjente koder", () => {
  const raw = edited(
    {
      new_top_level: { a: 1 },
      "channels.finn.headline.tone": "warm",
      "channels.finn.body.0.new_field": [1, 2],
      "channels.tiktok": { post: { text: "x" } },
      "basis.facts.0.confidence": 0.9,
      "last_run.step": "translating",
    },
    {
      key_facts: [{ key: "plot_area", status: "found", value_text: "300 m²", fact_ids: [] }],
      issues: [
        { id: "i3", code: "new_rule", severity: "critical", message: "Ny regel." },
        { id: "i4", code: "no_message", severity: "info" },
      ],
      documents: [{ id: "doc_3", file_name: "Vedtekter.pdf", kind: "association_documents", status: "scanning" }],
    }
  );
  const p = pkg(raw);
  assert.equal(p.channels?.finn?.headline.text, pkg().channels?.finn?.headline.text);
  assert.equal(p.keyFacts.length, 6);
  // Ukjent alvor skjules aldri: det regnes som material. Uten message kan avviket ikke vises.
  assert.deepEqual(p.issues.map((i) => [i.code, i.severity]), [
    ["conflicting_bra_i", "material"],
    ["length_outside_target", "info"],
    ["new_rule", "material"],
  ]);
  assert.deepEqual([p.documents[2].kind, p.documents[2].status], ["association_documents", null]);
  assert.equal(p.lastRun?.step, null);
  assert.equal(pkg({ ...SAMPLES.to_review, display_status: "archived" }).displayStatus, null);
});

test("parsing avviser feil form, aldri en halv pakke", () => {
  const broken: [string, Record<string, unknown>][] = [
    ["channels som tekst", { channels: "finn" }],
    ["finn som liste", { "channels.finn": [] }],
    ["overskrift uten tekst", { "channels.finn.headline.text": undefined }],
    ["overskrift som tall", { "channels.finn.headline.text": 42 }],
    ["ingress mangler", { "channels.finn.intro": undefined }],
    ["hovedtekst som tekst", { "channels.finn.body": "p1" }],
    ["avsnitt uten id", { "channels.finn.body.1.id": undefined }],
    ["fact_ids som tekst", { "channels.email.body.fact_ids": "f1" }],
    ["emneknagg som tall", { "channels.social.hashtags": ["#oslo", 7] }],
    ["faktalinja mangler", { "channels.social.fact_line": undefined }],
    ["signatur som tall", { "channels.email.signature": 1 }],
    ["key_facts som objekt", { key_facts: {} }],
    ["issues som tekst", { issues: "i1" }],
    ["avvik som tekst", { issues: ["i1"] }],
    ["grunnlaget som liste", { basis: [] }],
    ["approved som tekst", { approved: "yes" }],
    ["documents som objekt", { documents: { id: "doc_1" } }],
    ["last_run som tall", { last_run: 1 }],
  ];
  for (const [what, changes] of broken) {
    assert.equal(parseListingText(edited(changes)), null, what);
  }
  for (const raw of [null, undefined, 42, "x", [], {}, { assignment_id: "a" }, { display_status: "to_review" }]) {
    assert.equal(parseListingText(raw), null, JSON.stringify(raw));
  }
});

test("K §1: kontorprofilen leses med standardverdier, og ukjente kanaler hoppes over", () => {
  const profile = parseOfficeProfile({
    scope: "user",
    version: 0,
    is_default: true,
    settings: {
      schema_version: 1,
      style: "concrete_warm",
      address_form: "du",
      avoid_words: ["drømmebolig", 3, "unik"],
      email_signature: null,
      email_cta: "Meld deg på visning",
      channels: ["email", "tiktok", "finn"],
    },
  });
  assert.ok(profile);
  assert.equal(profile.isDefault, true);
  assert.deepEqual(profile.settings.avoidWords, ["drømmebolig", "unik"]);
  assert.equal(profile.settings.emailSignature, null);
  // Fast rekkefølge (K §9.1 punkt 8).
  assert.deepEqual(profile.settings.channels, ["finn", "email"]);
  assert.equal(parseOfficeProfile({ version: 1 }), null);
  assert.equal(parseOfficeProfile({ settings: {} }), null);
});

// --- tekst -------------------------------------------------------------------

test("K §0: hver display_status har egen tekst, med samme ord som ordren", () => {
  const nb = LISTING_TEXT_STATUSES.map((s) => t("nb", listingTextStatusKey(s)));
  assert.deepEqual(nb, ["Ikke bestilt", "Behandles", "Til godkjenning", "Godkjent", "Feilet"]);
  for (const s of LISTING_TEXT_STATUSES) assert.notEqual(t("en", listingTextStatusKey(s)), t("nb", listingTextStatusKey(s)));
  assert.equal(t("nb", listingTextStatusKey(null)), "Ukjent status");
});

test("K §0: trinnene i rekkefølge, og «Klar» til slutt", () => {
  assert.deepEqual(
    [...RUN_STEPS, "done" as const].map((s) => t("nb", runStepKey(s))),
    ["Leser dokumentene", "Ser på bildene", "Velger vinkel", "Skriver", "Kontrollerer", "Klar"]
  );
  assert.equal(new Set([...RUN_STEPS, "done" as const].map((s) => t("en", runStepKey(s)))).size, RUN_STEPS.length + 1);
});

test("K §9.2: tekst per severity og per status for nøkkelopplysningene, material først", () => {
  for (const locale of ["nb", "en"] as const) {
    assert.equal(new Set(SEVERITIES.map((s) => t(locale, severityKey(s)))).size, 2, locale);
    assert.equal(new Set(KEY_STATUSES.map((s) => t(locale, keyStatusKey(s)))).size, 3, locale);
  }
  assert.equal(t("nb", keyStatusKey("conflict")), "uavklart");
  const issues = pkg().issues;
  assert.deepEqual(sortIssues([...issues].reverse()).map((i) => i.severity), ["material", "info"]);
});

test("ordlista: kodene for dokumenttypene, de seks, feilene og kjørefeilene finnes på nb og en", () => {
  const groups: [CodeGroup, readonly string[]][] = [
    ["listingTextDocumentKind", DOCUMENT_KINDS],
    ["listingTextKeyFact", KEY_NAMES],
    ["listingTextDocumentReject", ["not_pdf", "size_mismatch", "too_large"]],
    [
      "listingTextRunError",
      ["document_unreadable", "too_many_pages", "model_unavailable", "invalid_model_output", "timeout", "interrupted", "stale", "not_available"],
    ],
    [
      "listingTextError",
      [
        "invalid_listing_text",
        "idempotency_key_required",
        "no_material",
        "invalid_document",
        "invalid_office_profile",
        "document_limit",
        "document_not_uploaded",
        "document_not_ready",
        "listing_text_busy",
        "listing_text_exists",
        "listing_text_not_ordered",
        "version_conflict",
        "not_current_version",
        "hash_mismatch",
        "media_deleted",
        "document_too_large",
        "listing_text_daily_limit",
        "listing_text_daily_cap",
        "listing_text_unavailable",
        "not_found",
        "network",
        "invalid_response",
      ],
    ],
  ];
  for (const [group, codes] of groups) {
    assert.deepEqual(
      Object.keys(DICTIONARIES.en.codes[group]).sort(),
      Object.keys(DICTIONARIES.nb.codes[group]).sort(),
      group
    );
    for (const code of codes) {
      for (const locale of ["nb", "en"] as const) {
        assert.ok(Object.hasOwn(DICTIONARIES[locale].codes[group], code), `${locale} ${group}.${code}`);
      }
    }
  }
  const listingKeys = (locale: "nb" | "en") => Object.keys(DICTIONARIES[locale].ui).filter((k) => k.startsWith("listingText."));
  assert.deepEqual(listingKeys("en").sort(), listingKeys("nb").sort());
  assert.equal(codeText("nb", "listingTextDocumentKind", "association_documents"), "Dokument");
  assert.equal(codeText("en", "listingTextKeyFact", "bra_i"), "BRA-i");
});

// --- feltstiene --------------------------------------------------------------

test("feltstiene: oppslag og validering som parse_field_path", () => {
  assert.deepEqual(parseFieldPath("finn.headline"), { channel: "finn", field: "headline", kind: "text", itemId: null });
  assert.deepEqual(parseFieldPath("finn.body.p2"), { channel: "finn", field: "body", kind: "items", itemId: "p2" });
  assert.equal(parseFieldPath("finn.highlights.h1")?.itemId, "h1");
  assert.equal(parseFieldPath("social.hashtags")?.kind, "tags");
  assert.equal(parseFieldPath("email.signature")?.kind, "plain");
  for (const bad of [
    "",
    "finn",
    "finn.title",
    "tiktok.post",
    "finn.body.h1",
    "finn.highlights.p1",
    "finn.body.p1000",
    "finn.body.p",
    "finn.headline.p1",
    "finn.body.p1.x",
    "__proto__.x",
    "finn.toString",
    `finn.body.p1${"x".repeat(60)}`,
  ]) {
    assert.equal(parseFieldPath(bad), null, bad);
  }
});

test("K §9.2 punkt 5: faktalinja og signaturen kan ikke redigeres, og lister bare per avsnitt", () => {
  for (const path of ["finn.headline", "finn.body.p2", "finn.highlights.h3", "social.post", "social.hashtags", "email.subject"]) {
    assert.ok(isEditableFieldPath(path), path);
  }
  for (const path of ["social.fact_line", "email.signature", "finn.body", "finn.highlights", "nope"]) {
    assert.ok(!isEditableFieldPath(path), path);
  }
});

test("getFieldText og editableFieldPaths på eksempelet", () => {
  const channels = pkg().channels;
  assert.ok(channels);
  assert.equal(getFieldText(channels, "finn.body.p2"), channels.finn?.body[1].text);
  assert.equal(getFieldText(channels, "finn.body"), channels.finn?.body.map((p) => p.text).join("\n\n"));
  assert.equal(getFieldText(channels, "social.hashtags"), "#grünerløkka #oslo");
  assert.equal(getFieldText(channels, "social.fact_line"), channels.social?.factLine.text);
  assert.equal(getFieldText(channels, "email.signature"), channels.email?.signature);
  assert.equal(getFieldText(channels, "finn.body.p9"), null);
  assert.equal(getFieldText({ ...channels, email: null }, "email.subject"), null);
  assert.deepEqual(editableFieldPaths(channels), [
    "finn.headline",
    "finn.intro",
    "finn.body.p1",
    "finn.body.p2",
    "finn.body.p3",
    "finn.highlights.h1",
    "finn.highlights.h2",
    "finn.highlights.h3",
    "finn.highlights.h4",
    "finn.neighbourhood",
    "social.post",
    "social.hashtags",
    "email.subject",
    "email.preheader",
    "email.body",
  ]);
  for (const path of editableFieldPaths(channels)) assert.ok(isEditableFieldPath(path), path);
  // Feltene i avvikene er gyldige stier.
  for (const issue of pkg().issues) for (const path of issue.fields) assert.ok(parseFieldPath(path), path);
});

test("K §9.3 punkt 5: «Kopier» bruker copy_text fra backend, ikke en egen sammensetting", () => {
  const channels = pkg().channels;
  assert.ok(channels);
  assert.equal(copyTextFor(channels, "finn.headline"), channels.finn?.headline.text);
  assert.equal(copyTextFor(channels, "finn.body"), channels.finn?.body.map((p) => p.text).join("\n\n"));
  assert.match(copyTextFor(channels, "finn.highlights") ?? "", /^• Vestvendt balkong på 8 m²\n• /);
  assert.match(copyTextFor(channels, "social.post") ?? "", /\n\n#grünerløkka #oslo$/);
  assert.equal(copyTextFor(channels, "finn.body.p1"), null);
  assert.equal(copyTextFor(channels, "nope"), null);
  const withoutCopy = pkg(edited({ "channels.finn.copy_text": undefined })).channels;
  assert.ok(withoutCopy);
  assert.equal(copyTextFor(withoutCopy, "finn.headline"), null);
});

// --- teller og lengdemål -----------------------------------------------------

test("telleren: ord på mellomrom og tegn etter NFC, som count_words og count_chars", () => {
  assert.equal(countChars("Grünerløkka"), 11);
  assert.equal(countChars("æøå ÆØÅ"), 7);
  // NFD fra macOS: a + ring er ett tegn.
  const nfd = "Ga\u030Ard og blå".normalize("NFD");
  assert.ok(nfd.length > "Gård og blå".length);
  assert.equal(countChars(nfd), countChars("Gård og blå"));
  assert.equal(countWords(nfd), 3);
  assert.equal(countWords("Lys 3-roms med bade-/vaskerom"), 4);
  assert.equal(countWords("  to   ord  "), 2);
  assert.equal(countWords("kr 5\u00a0760\u202f000"), 4);
  assert.equal(countWords("linje\nlinje\tord"), 3);
  assert.equal(countWords(""), 0);
  assert.equal(countChars(""), 0);
  // Kodepunkter, ikke UTF-16-enheter, som len() i Python.
  assert.equal(countChars("🏠"), 1);
});

test("K §5: lengdemålene og overskriften over 120 tegn", () => {
  assert.deepEqual(LENGTH_TARGETS["finn.intro"], ["words", 50, 90]);
  assert.deepEqual(checkLength("finn.headline", 60), { unit: "chars", value: 60, min: 50, max: 90, status: "ok" });
  assert.equal(checkLength("finn.headline", 49).status, "short");
  assert.equal(checkLength("finn.headline", 91).status, "long");
  assert.equal(checkLength("finn.headline", 120).status, "long");
  assert.equal(checkLength("finn.headline", 121).status, "too_long");
  assert.equal(checkLength("finn.body", 400).status, "long");
  assert.deepEqual(checkLength("finn.body", 300), { unit: "words", value: 300, min: 180, max: 350, status: "ok" });
  assert.equal(checkLength("social.hashtags", 0).status, "ok");
  assert.equal(checkLength("social.hashtags", 4).status, "long");
});

test("eksempelet: bare SoMe-innlegget er utenfor målet, og avviket har samme tall", () => {
  const p = pkg();
  assert.ok(p.channels);
  const measured = measureChannels(p.channels);
  assert.deepEqual(Object.keys(measured).sort(), Object.keys(LENGTH_TARGETS).sort());
  const outside = (Object.entries(measured) as [LengthPath, number][])
    .filter(([path, n]) => checkLength(path, n).status !== "ok")
    .map(([path]) => path);
  assert.deepEqual(outside, ["social.post"]);
  const issue = p.issues.find((i) => i.code === "length_outside_target");
  assert.deepEqual(issue?.fields, ["social.post"]);
  assert.match(issue?.message ?? "", new RegExp(`^${measured["social.post"]} ord;`));
});

// --- API-kallene mot en falsk request ----------------------------------------

function fake(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { path: string; init: RequestInit }[] = [];
  const request: AssignmentRequest = async (path, init) => {
    calls.push({ path, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
  };
  return { calls, request };
}

const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);
const jsonBody = (init: RequestInit) => JSON.parse(String(init.body));

test("getListingText: uten grunnlaget som standard, med include=basis og version", async () => {
  const plain = fake(200, SAMPLES.to_review);
  const p = await getListingText(plain.request, "asg/1");
  assert.equal(p.version, 3);
  assert.equal(plain.calls[0].path, "/v1/assignments/asg%2F1/listing-text");
  assert.equal(plain.calls[0].init.method, "GET");
  const withBasis = fake(200, SAMPLES.to_review);
  await getListingText(withBasis.request, "asg_1", { includeBasis: true, version: 2 });
  assert.equal(withBasis.calls[0].path, "/v1/assignments/asg_1/listing-text?version=2&include=basis");
  const bad = fake(200, { display_status: "to_review" });
  await assert.rejects(getListingText(bad.request, "a"), (err: unknown) => err instanceof ListingTextError && err.code === "invalid_response");
});

test("dokumentene: start med Idempotency-Key, complete og slett", async () => {
  const start = fake(201, {
    document: { id: "doc_1", file_name: "Salgsoppgave.pdf", bytes: 41234567, status: "pending", kind: null, pages: null },
    upload: { signed_url: "https://lager.example/upload?token=t", token: "t", path: "asg_1/doc_1.pdf", expires_at: "x" },
  });
  const res = await startListingTextDocument(start.request, {
    id: "asg_1",
    fileName: "Salgsoppgave.pdf",
    bytes: 41234567,
    idempotencyKey: "doc-key-1",
  });
  assert.equal(res.document.status, "pending");
  assert.equal(res.upload.path, "asg_1/doc_1.pdf");
  assert.equal(start.calls[0].path, "/v1/assignments/asg_1/listing-text/documents");
  assert.equal(start.calls[0].init.method, "POST");
  assert.equal(header(start.calls[0].init, "Idempotency-Key"), "doc-key-1");
  assert.equal(header(start.calls[0].init, "Content-Type"), "application/json");
  assert.deepEqual(jsonBody(start.calls[0].init), { file_name: "Salgsoppgave.pdf", bytes: 41234567, content_type: "application/pdf" });
  const noKey = fake(201, { document: { id: "d" }, upload: { signed_url: "u", token: "t", path: "p" } });
  await startListingTextDocument(noKey.request, { id: "a", fileName: "a.pdf", bytes: 1 });
  assert.equal(header(noKey.calls[0].init, "Idempotency-Key"), null);

  const complete = fake(200, { document: { id: "doc_1", status: "rejected", reject_code: "not_pdf" } });
  const doc = await completeListingTextDocument(complete.request, { id: "asg_1", documentId: "doc_1" });
  assert.deepEqual([doc.status, doc.rejectCode], ["rejected", "not_pdf"]);
  assert.equal(complete.calls[0].path, "/v1/assignments/asg_1/listing-text/documents/doc_1/complete");
  assert.equal(complete.calls[0].init.method, "POST");

  const del = fake(204, undefined);
  await deleteListingTextDocument(del.request, { id: "asg_1", documentId: "doc_1" });
  assert.equal(del.calls[0].path, "/v1/assignments/asg_1/listing-text/documents/doc_1");
  assert.equal(del.calls[0].init.method, "DELETE");
  const tooLarge = fake(413, { detail: { code: "document_too_large", limit_bytes: 104857600 } });
  await assert.rejects(
    startListingTextDocument(tooLarge.request, { id: "a", fileName: "a.pdf", bytes: 2e8 }),
    (err: unknown) => err instanceof ListingTextError && err.code === "document_too_large" && err.detail.limit_bytes === 104857600
  );
});

test("bestill og «Lag på nytt»: 202, kroppen og Idempotency-Key", async () => {
  const order = fake(202, SAMPLES.processing);
  const p = await orderListingText(order.request, {
    id: "asg_1",
    order: { note: "Ny kjøkkeninnredning 2024", documentIds: ["doc_1"] },
    idempotencyKey: "k-1",
  });
  assert.equal(p.displayStatus, "processing");
  assert.equal(order.calls[0].path, "/v1/assignments/asg_1/listing-text");
  assert.equal(order.calls[0].init.method, "POST");
  assert.equal(header(order.calls[0].init, "Idempotency-Key"), "k-1");
  assert.deepEqual(jsonBody(order.calls[0].init), { note: "Ny kjøkkeninnredning 2024", document_ids: ["doc_1"] });

  const again = fake(202, SAMPLES.processing);
  await regenerateListingText(again.request, { id: "asg_1", order: { note: "  " }, idempotencyKey: "k-2" });
  assert.equal(again.calls[0].path, "/v1/assignments/asg_1/listing-text/regenerate");
  assert.equal(header(again.calls[0].init, "Idempotency-Key"), "k-2");
  // Tomt notat sendes ikke: da gjelder samme grunnlag som forrige kjøring (K §3).
  assert.deepEqual(jsonBody(again.calls[0].init), {});

  const exists = fake(409, { detail: { code: "listing_text_exists" } });
  await assert.rejects(
    orderListingText(exists.request, { id: "a", order: {}, idempotencyKey: "k" }),
    (err: unknown) => listingTextErrorCode(err) === "listing_text_exists"
  );
});

test("FE-3-regelen: ny nøkkel per bestilling, samme bare ved nytt forsøk med samme kropp", () => {
  let n = 0;
  const keys = new CallKeys(() => `key-${++n}`);
  const first = orderCallSignature("order", "asg_1", { note: "Ny kjøkkeninnredning", documentIds: ["doc_1"] });
  assert.equal(keys.keyFor(first), "key-1");
  // Nettfeil: samme kall paa nytt faar samme noekkel.
  assert.equal(keys.keyFor(orderCallSignature("order", "asg_1", { note: "Ny kjøkkeninnredning", documentIds: ["doc_1"] })), "key-1");
  // Endret kropp, annen rute eller annen ordre er en ny bestilling.
  assert.equal(keys.keyFor(orderCallSignature("order", "asg_1", { note: "Ny kjøkkeninnredning 2024", documentIds: ["doc_1"] })), "key-2");
  assert.equal(keys.keyFor(orderCallSignature("regenerate", "asg_1", { note: "Ny kjøkkeninnredning 2024", documentIds: ["doc_1"] })), "key-3");
  assert.equal(keys.keyFor(orderCallSignature("regenerate", "asg_2", { note: "Ny kjøkkeninnredning 2024", documentIds: ["doc_1"] })), "key-4");
  // Svar mottatt (202 eller feilsvar): neste bestilling faar ny noekkel, ogsaa med samme kropp.
  keys.received();
  assert.equal(keys.keyFor(orderCallSignature("regenerate", "asg_2", { note: "Ny kjøkkeninnredning 2024", documentIds: ["doc_1"] })), "key-5");
});

test("lagre versjon: base_version, base_sha256 og feltstiene; ugyldig sti sendes aldri", async () => {
  const save = fake(201, { ...SAMPLES.to_review, version: 4 });
  const p = await saveListingTextVersion(save.request, {
    id: "asg_1",
    baseVersion: 3,
    baseSha256: "cd34",
    fields: { "finn.headline": "Ny overskrift", "finn.body.p2": "", "social.hashtags": "#oslo #løkka" },
  });
  assert.equal(p.version, 4);
  assert.equal(save.calls[0].path, "/v1/assignments/asg_1/listing-text/versions");
  assert.equal(save.calls[0].init.method, "POST");
  assert.deepEqual(jsonBody(save.calls[0].init), {
    base_version: 3,
    base_sha256: "cd34",
    fields: { "finn.headline": "Ny overskrift", "finn.body.p2": "", "social.hashtags": "#oslo #løkka" },
  });
  for (const bad of ["social.fact_line", "email.signature", "finn.body", "finn.title"]) {
    const never = fake(201, SAMPLES.to_review);
    await assert.rejects(
      saveListingTextVersion(never.request, { id: "a", baseVersion: 1, baseSha256: "x", fields: { [bad]: "x" } }),
      (err: unknown) => err instanceof ListingTextError && err.httpStatus === 0 && err.detail.field === bad
    );
    assert.equal(never.calls.length, 0, bad);
  }
  const conflict = fake(409, { detail: { code: "version_conflict", current_version: 5 } });
  await assert.rejects(
    saveListingTextVersion(conflict.request, { id: "a", baseVersion: 3, baseSha256: "x", fields: {} }),
    (err: unknown) => err instanceof ListingTextError && err.code === "version_conflict" && err.detail.current_version === 5
  );
});

test("godkjenn: version og content_sha256, 200 gir approved", async () => {
  const approvedBody = {
    ...SAMPLES.to_review,
    display_status: "approved",
    approved: { version: 3, content_sha256: "cd34", at: "2026-11-02T10:15:00Z", by_role: "owner" },
  };
  const approve = fake(200, approvedBody);
  const p = await approveListingText(approve.request, { id: "asg_1", version: 3, contentSha256: "cd34" });
  assert.equal(p.displayStatus, "approved");
  assert.deepEqual(p.approved, { version: 3, contentSha256: "cd34", at: "2026-11-02T10:15:00Z", byRole: "owner" });
  assert.equal(approve.calls[0].path, "/v1/assignments/asg_1/listing-text/approve");
  assert.deepEqual(jsonBody(approve.calls[0].init), { version: 3, content_sha256: "cd34" });
});

test("kontorprofilen: GET og PUT med version og settings", async () => {
  const body = {
    scope: "user",
    version: 3,
    is_default: false,
    settings: {
      schema_version: 1,
      style: "concrete_short",
      address_form: "none",
      avoid_words: ["unik"],
      email_signature: "Kari Megler",
      email_cta: null,
      channels: ["finn", "social", "email"],
    },
  };
  const get = fake(200, body);
  const profile = await getOfficeProfile(get.request);
  assert.equal(get.calls[0].path, "/v1/office-profile");
  assert.equal(get.calls[0].init.method, "GET");
  const put = fake(200, { ...body, version: 4 });
  const saved = await putOfficeProfile(put.request, { version: profile.version, settings: profile.settings });
  assert.equal(saved.version, 4);
  assert.equal(put.calls[0].path, "/v1/office-profile");
  assert.equal(put.calls[0].init.method, "PUT");
  assert.deepEqual(jsonBody(put.calls[0].init), { version: 3, settings: body.settings });
});

test("K §6: eksport-stien med versjon, format og kanalene i fast rekkefølge", () => {
  assert.equal(
    listingTextExportPath("asg_1", { version: 3 }),
    "/v1/assignments/asg_1/listing-text/export?version=3&format=txt&channels=finn,social,email"
  );
  assert.equal(
    listingTextExportPath("asg 1", { version: 2, channels: ["email", "finn"] }),
    "/v1/assignments/asg%201/listing-text/export?version=2&format=txt&channels=finn,email"
  );
});

test("feilene: kode fra backend, Retry-After ved 429, og 404/503/nett uten kode", async () => {
  const limit = fake(429, { detail: { code: "listing_text_daily_limit", limit: 10 } }, { "Retry-After": "3600" });
  await assert.rejects(
    orderListingText(limit.request, { id: "a", order: {}, idempotencyKey: "k" }),
    (err: unknown) => err instanceof ListingTextError && err.code === "listing_text_daily_limit" && err.retryAfter === 3600
  );
  const r404 = fake(404, { detail: "not found" });
  await assert.rejects(getListingText(r404.request, "a"), (err: unknown) => listingTextErrorCode(err) === "not_found");
  const r503 = fake(503, null);
  await assert.rejects(getListingText(r503.request, "a"), (err: unknown) => listingTextErrorCode(err) === "listing_text_unavailable");
  const r500 = fake(500, null);
  await assert.rejects(getListingText(r500.request, "a"), (err: unknown) => listingTextErrorCode(err) === "http_500");
  assert.equal(listingTextErrorCode(new TypeError("Failed to fetch")), "network");
  assert.equal(codeText("nb", "listingTextError", listingTextErrorCode(new TypeError("x"))), "Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.");
});
