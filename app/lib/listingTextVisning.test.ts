import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AssignmentRequest } from "./assignments.ts";
import { copyText } from "./clipboard.ts";
import { codeText, DICTIONARIES, t, type UiKey } from "./i18n/index.ts";
import * as listingText from "./listingText.ts";
import {
  checkLength,
  copyTextFor,
  getListingText,
  getListingTextDocumentUrl,
  keyStatusKey,
  LENGTH_TARGETS,
  measureChannels,
  measuredBody,
  orderListingText,
  splitWorthKnowing,
  parseListingText,
  sortIssues,
  type LengthPath,
  type ListingText,
  type ListingTextIssue,
} from "./listingText.ts";
import { createListingTextMock } from "./listingTextMock.ts";
import {
  channelName,
  checkKey,
  factsFor,
  factSource,
  fetchBasis,
  fieldAnchorId,
  fieldFactIds,
  fieldRef,
  groupFacts,
  issueCountText,
  issuesForField,
  lastRunFailedText,
  lengthText,
  openListingTextDocument,
  outsideTarget,
  pdfHref,
  pdfResultText,
  presentChannels,
  statusTone,
  worthKnowing,
  type PdfTab,
} from "./listingTextPackage.ts";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

/**
 * Annonsetekst, visningen av tekstpakken (TG-NEW-281, T3): lengdene fra lt3,
 * «Verdt å vite», avvikene, nøkkelopplysningene, kanalene, «Kopier», kildene,
 * grunnlaget og «Åpne PDF», mock-pakken og ordlista. Komponentene leses som
 * tekst (node --test laster ikke .tsx), som i T2.
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const NEW_COMPONENTS = [
  "components/annonsetekst/ListingTextPackage.tsx",
  "components/annonsetekst/ListingTextChannel.tsx",
  "components/annonsetekst/ListingTextFacts.tsx",
  "components/annonsetekst/ListingTextBasisPanel.tsx",
];
const NEW_MODULES = ["lib/listingTextPackage.ts", "hooks/useListingTextBasis.ts", "lib/listingTextMock.ts"];

const SAMPLE = (JSON.parse(readFileSync(new URL("./testdata/listing_text_v1.json", import.meta.url), "utf-8")) as Record<string, Record<string, unknown>>)
  .to_review;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function pkg(raw: Record<string, unknown> = SAMPLE): ListingText {
  const parsed = parseListingText(raw);
  assert.ok(parsed);
  return parsed;
}

const issue = (over: Partial<ListingTextIssue>): ListingTextIssue => ({
  id: "i",
  code: "x",
  severity: "info",
  message: "Melding.",
  suggestion: null,
  factIds: [],
  fields: [],
  ...over,
});

/** En falsk request som svarer med det samme og husker kallene. */
function fake(status: number, body: unknown) {
  const calls: { path: string; init: RequestInit }[] = [];
  const request: AssignmentRequest = async (path, init) => {
    calls.push({ path, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  };
  return { request, calls };
}

/** Mock-pakken etter «Behandles» (fra bestilling til `to_review`). */
async function mockReady() {
  const mock = createListingTextMock("asg_mock", { latencyMs: 0 });
  await orderListingText(mock.request, { id: "asg_mock", order: { note: "Hei" }, idempotencyKey: "k1" });
  let p = await getListingText(mock.request, "asg_mock");
  while (p.displayStatus === "processing") p = await getListingText(mock.request, "asg_mock");
  return { mock, p };
}

// --- lengdene (lt3) ----------------------------------------------------------

test("lengdene: de nye maalene fra lt3, og teksten «62 ord · mål 50–90»", () => {
  assert.deepEqual(LENGTH_TARGETS["finn.intro"], ["words", 50, 90]);
  assert.deepEqual(LENGTH_TARGETS["finn.neighbourhood"], ["words", 50, 120]);
  assert.deepEqual(LENGTH_TARGETS["finn.body"], ["words", 180, 350]);
  // Valg b (31.10): ingen egen regel for komplekse boliger.
  assert.equal(Object.hasOwn(listingText, "BODY_WORDS_COMPLEX"), false);
  assert.equal(checkLength.length, 2);
  assert.equal(checkLength("finn.body", 400).status, "long");
  assert.match(read("lib/listingText.ts"), /Kilden er\s+\* `LENGTH_TARGETS` i backend \(`services\/listing_text_checks\.py`/);
  assert.equal(lengthText("nb", "finn.intro", 62), "62 ord · mål 50–90");
  assert.equal(lengthText("nb", "finn.headline", 61), "61 tegn · mål 50–90");
  assert.equal(lengthText("nb", "finn.highlights", 5), "5 · mål 4–6");
  assert.equal(lengthText("en", "finn.intro", 62), "62 words · target 50–90");
  // Hovedteksten: ett maal for alle boliger, uten «Verdt å vite».
  assert.equal(lengthText("nb", "finn.body", 312), "312 ord · mål 180–350 ord, uten «Verdt å vite»");
  assert.equal(t("nb", "listingText.length.bodyTarget", { min: 180, max: 350 }), "mål 180–350 ord, uten «Verdt å vite»");
});

test("lengdene: «utenfor målet» kommer bare fra avvikene i backend", () => {
  const p = pkg();
  assert.ok(p.channels);
  // Ingressen er utenfor maalet etter tellingen her, men uten avvik er den ikke merket.
  const raw = clone(SAMPLE);
  ((raw.channels as Record<string, Record<string, Record<string, unknown>>>).finn.intro).text = "Kort.";
  const short = pkg(raw);
  assert.equal(checkLength("finn.intro", measureChannels(short.channels!)["finn.intro"]!).status, "short");
  assert.equal(outsideTarget(short.issues, "finn.intro"), false);
  // Avviket fra backend avgjoer: length_outside_target og headline_too_long, med feltet i `fields`.
  assert.equal(outsideTarget([issue({ code: "length_outside_target", fields: ["finn.intro"] })], "finn.intro"), true);
  assert.equal(outsideTarget([issue({ code: "headline_too_long", severity: "material", fields: ["finn.headline"] })], "finn.headline"), true);
  assert.equal(outsideTarget([issue({ code: "cliche", fields: ["finn.intro"] })], "finn.intro"), false);
  assert.equal(outsideTarget([issue({ code: "length_outside_target", fields: ["finn.body.p3"] })], "finn.body"), false);
  assert.equal(outsideTarget(p.issues, "social.post"), true);
  // Komponenten bruker avvikene, ikke checkLength.
  const channel = withoutComments(read("components/annonsetekst/ListingTextChannel.tsx"));
  assert.match(channel, /const outside = outsideTarget\(ctx\.issues, path\);/);
  assert.doesNotMatch(channel, /checkLength/);
});

// --- «Verdt å vite» ----------------------------------------------------------

test("«Verdt å vite»: siste avsnitt telles for seg og starten utheves", () => {
  const body = [
    { id: "p1", text: "Verdt å vite: ikke siste avsnitt.", factIds: [], check: null },
    { id: "p2", text: "Verdt å vite: Badet har TG2. Tilstandsrapporten har detaljene.", factIds: [], check: null },
  ];
  assert.deepEqual(worthKnowing(body), { id: "p2", words: 9 });
  assert.equal(worthKnowing([body[0], { id: "p2", text: "Vanlig avsnitt.", factIds: [], check: null }]), null);
  assert.equal(worthKnowing([]), null);
  // Hovedteksten maales uten siste avsnitt naar det er «Verdt å vite», og med det ellers.
  assert.deepEqual(measuredBody(body).map((p) => p.id), ["p1"]);
  const plain = [body[0], { id: "p2", text: "Vanlig avsnitt.", factIds: [], check: null }];
  assert.equal(measuredBody(plain).length, 2);
  const channels = { finn: { ...pkg().channels!.finn!, body }, social: null, email: null };
  assert.equal(measureChannels(channels)["finn.body"], 6);
  assert.deepEqual(splitWorthKnowing("Verdt å vite: Fukt i boden."), { lead: "Verdt å vite:", rest: " Fukt i boden." });
  // NFD fra macOS og mellomrom foerst.
  assert.deepEqual(splitWorthKnowing("  Verdt å vite: x".normalize("NFD")), { lead: "Verdt å vite:", rest: " x" });
  assert.equal(splitWorthKnowing("Det er verdt å vite: x"), null);
  assert.equal(t("nb", "listingText.length.worthKnowing", { n: 10 }), "«Verdt å vite»: 10 ord");
  const channel = withoutComments(read("components/annonsetekst/ListingTextChannel.tsx"));
  assert.match(channel, /const worth = i === items\.length - 1 \? splitWorthKnowing\(item\.text\) : null;/);
  assert.match(channel, /<strong className="font-semibold">\{worth\.lead\}<\/strong>\s*\{worth\.rest\}/);
  assert.match(channel, /"listingText\.length\.worthKnowing", \{ n: worth\.words \}/);
});

// --- avvikene ----------------------------------------------------------------

test("avvikene: material foerst, og antall-linja", () => {
  const issues = [
    issue({ id: "a" }),
    issue({ id: "b", severity: "material" }),
    issue({ id: "c" }),
    issue({ id: "d", severity: "material" }),
    issue({ id: "e" }),
  ];
  assert.deepEqual(sortIssues(issues).map((i) => i.id), ["b", "d", "a", "c", "e"]);
  assert.equal(issueCountText("nb", issues), "2 vesentlige avvik, 3 til orientering");
  assert.equal(issueCountText("nb", [issue({ severity: "material" })]), "1 vesentlig avvik");
  assert.equal(issueCountText("nb", [issue({})]), "1 til orientering");
  assert.equal(issueCountText("nb", []), "Ingen avvik.");
  assert.equal(issueCountText("en", issues), "2 material issues, 3 for information");
  assert.match(withoutComments(read("components/annonsetekst/ListingTextPackage.tsx")), /const issues = sortIssues\(pkg\.issues\);/);
});

test("avvikene: feltnavnene paa norsk, med avsnitt og punkt etter plassen i lista", () => {
  const p = pkg();
  assert.ok(p.channels);
  assert.deepEqual(fieldRef("nb", "finn.intro", p.channels), {
    text: "Boligportal · ingress",
    channel: "finn",
    anchor: "lt-field-finn-intro",
  });
  assert.equal(fieldRef("nb", "finn.body.p3", p.channels).text, "Boligportal · hovedtekst, avsnitt 3");
  assert.equal(fieldRef("nb", "finn.highlights.h2", p.channels).text, "Boligportal · høydepunkter, punkt 2");
  assert.equal(fieldRef("nb", "social.post", p.channels).text, "SoMe · innlegg");
  assert.equal(fieldRef("nb", "email.preheader", p.channels).text, "E-post · forhåndstekst");
  assert.equal(fieldRef("en", "finn.intro", p.channels).text, "Listing portal · intro");
  // Ukjent sti, avsnitt som ikke finnes og kanal som mangler: tekst uten lenke.
  assert.deepEqual(fieldRef("nb", "finn.ukjent", p.channels), { text: "Felt", channel: null, anchor: null });
  assert.equal(fieldRef("nb", "finn.body.p9", p.channels).anchor, null);
  const noEmail = { ...p.channels, email: null };
  assert.deepEqual(fieldRef("nb", "email.subject", noEmail), { text: "E-post · emne", channel: null, anchor: null });
  assert.equal(fieldAnchorId("finn.body.p3"), "lt-field-finn-body-p3");
  // Et avvik paa et avsnitt markerer feltet og avsnittet, ikke de andre avsnittene.
  const onP3 = [issue({ fields: ["finn.body.p3"] })];
  assert.equal(issuesForField(onP3, "finn.body").length, 1);
  assert.equal(issuesForField(onP3, "finn.body.p3").length, 1);
  assert.equal(issuesForField(onP3, "finn.body.p1").length, 0);
  assert.equal(issuesForField(onP3, "finn.bod").length, 0);
});

test("avvikene: klikk paa feltnavnet bytter fane, ruller til feltet og markerer det kort", () => {
  const facts = withoutComments(read("components/annonsetekst/ListingTextFacts.tsx"));
  assert.match(facts, /ref\.anchor !== null \? \(\s*<button[\s\S]*?onClick=\{\(\) => ctx\.onGoTo\(ref\)\}/);
  const page = withoutComments(read("components/annonsetekst/ListingTextPackage.tsx"));
  assert.match(page, /setTab\(ref\.channel\);/);
  assert.match(page, /const el = document\.getElementById\(focus\.anchor\);/);
  assert.match(page, /el\.scrollIntoView\(\{ behavior: prefersReducedMotion\(\) \? "auto" : "smooth", block: "center" \}\);/);
  assert.match(page, /setTimeout\(\(\) => setFocus\(null\), FLASH_MS\)/);
  const channel = withoutComments(read("components/annonsetekst/ListingTextChannel.tsx"));
  assert.match(channel, /ctx\.flash === anchor \? FLASH : ""/);
  assert.match(channel, /id=\{anchor\}\s*tabIndex=\{-1\}/);
});

test("avvikene: message og suggestion urørt, ukjent kode vises likt, ingen tekst per kode", () => {
  const facts = withoutComments(read("components/annonsetekst/ListingTextFacts.tsx"));
  const row = facts.slice(facts.indexOf("export function IssueRow"));
  assert.match(row, /\{issue\.message\}/);
  assert.match(row, /\{issue\.suggestion\}/);
  assert.match(row, /t\(locale, severityKey\(issue\.severity\)\)/);
  assert.doesNotMatch(row, /issue\.code/);
  // Ukjent kode fra backend parses og vises som andre avvik.
  const raw = clone(SAMPLE);
  (raw.issues as unknown[]).push({ id: "i9", code: "brand_new_check", severity: "info", message: "Ny kontroll.", suggestion: "Gjør noe.", fields: ["finn.intro"] });
  const p = pkg(raw);
  const unknown = p.issues.find((i) => i.code === "brand_new_check");
  assert.equal(unknown?.message, "Ny kontroll.");
  assert.equal(unknown?.suggestion, "Gjør noe.");
  // meta_reference: teksten fra backend, ingen egen tekst i ordlista.
  assert.equal(Object.hasOwn(DICTIONARIES.nb.codes, "listingTextIssue"), false);
});

// --- nøkkelopplysningene -----------------------------------------------------

test("nøkkelopplysningene: funnet, mangler og uavklart, med missing og conflict tydelig", () => {
  assert.equal(t("nb", keyStatusKey("found")), "funnet");
  assert.equal(t("nb", keyStatusKey("missing")), "mangler");
  assert.equal(t("nb", keyStatusKey("conflict")), "uavklart");
  const page = withoutComments(read("components/annonsetekst/ListingTextPackage.tsx"));
  assert.match(page, /const KEY_TONES = \{ found: "green", missing: "red", conflict: "amber" \} as const;/);
  assert.match(page, /k\.status === "missing" \? "border-red-fg" : "border-amber-fg"/);
  assert.match(page, /codeText\(locale, "listingTextKeyFact", k\.key\)/);
  assert.match(page, /const rows = KEY_NAMES\.map/);
});

// --- kanalene ----------------------------------------------------------------

test("kanalene: fast rekkefoelge, bare de som finnes, og nabolag som kan mangle", () => {
  const p = pkg();
  assert.ok(p.channels);
  assert.deepEqual(presentChannels(p.channels), ["finn", "social", "email"]);
  assert.deepEqual(presentChannels({ email: p.channels.email, finn: p.channels.finn, social: null }), ["finn", "email"]);
  assert.deepEqual(presentChannels({ finn: null, social: null, email: null }), []);
  assert.deepEqual(["finn", "social", "email"].map((c) => channelName("nb", c as "finn")), ["Boligportal", "SoMe", "E-post"]);
  const raw = clone(SAMPLE);
  (raw.channels as Record<string, Record<string, unknown>>).finn.neighbourhood = null;
  assert.equal(pkg(raw).channels?.finn?.neighbourhood, null);
  const channel = withoutComments(read("components/annonsetekst/ListingTextChannel.tsx"));
  assert.match(channel, /\{finn\.neighbourhood !== null && \(/);
  const page = withoutComments(read("components/annonsetekst/ListingTextPackage.tsx"));
  assert.match(page, /role="tablist"/);
  assert.match(page, /overflow-x-auto/);
  assert.match(page, /\{present\.map\(\(c\) => \(/);
});

test("kanalene: check gir «Delvis støttet …» og «Ikke støttet …», supported vises ikke", () => {
  assert.equal(checkKey("partial"), "listingText.check.partial");
  assert.equal(checkKey("unsupported"), "listingText.check.unsupported");
  assert.equal(checkKey("supported"), null);
  assert.equal(checkKey(null), null);
  assert.equal(t("nb", "listingText.check.partial"), "Delvis støttet av grunnlaget");
  assert.equal(t("nb", "listingText.check.unsupported"), "Ikke støttet av grunnlaget");
  const channel = withoutComments(read("components/annonsetekst/ListingTextChannel.tsx"));
  assert.equal([...channel.matchAll(/<CheckNote ctx=\{ctx\} item=\{item\} \/>/g)].length, 2);
});

// --- «Kopier» ----------------------------------------------------------------

test("«Kopier» bruker copy_text fra backend, og feil i utklippstavlen markerer teksten", async () => {
  const raw = clone(SAMPLE);
  const finn = (raw.channels as Record<string, Record<string, unknown>>).finn;
  finn.copy_text = { ...(finn.copy_text as Record<string, string>), body: "KOPI FRA BACKEND" };
  const p = pkg(raw);
  assert.ok(p.channels);
  assert.equal(copyTextFor(p.channels, "finn.body"), "KOPI FRA BACKEND");
  assert.equal(copyTextFor(p.channels, "finn.body.p1"), null);
  const channel = withoutComments(read("components/annonsetekst/ListingTextChannel.tsx"));
  assert.match(channel, /const copyValue = copyTextFor\(ctx\.channels, path\);/);
  assert.match(channel, /\{copyValue !== null && \(/);
  assert.match(channel, /await copyText\(value\)/);
  assert.match(channel, /window\.getSelection\(\)\?\.selectAllChildren\(textRef\.current\)/);
  assert.match(channel, /copy === "failed" \? t\(locale, "review\.copyFailed"\) : ""/);
  assert.match(channel, /copy === "copied" \? "review\.copied" : "action\.copy"/);
  // Ingen sammensetting av teksten i frontend.
  assert.doesNotMatch(channel, /\.join\("\\n\\n"\)|• /);
  assert.equal(await copyText("x", { writeText: async () => Promise.reject(new Error("nei")) }), "failed");
  assert.equal(await copyText("x", undefined), "failed");
});

// --- kildene -----------------------------------------------------------------

test("kildene: dokument med side og PDF, bilde, megler og utregnet, med material", async () => {
  const { p, mock } = await mockReady();
  const basis = await fetchBasis(mock.request, "asg_mock", 1);
  assert.ok(basis);
  const byId = (id: string) => basis.facts.find((f) => f.id === id)!;
  assert.deepEqual(factSource("nb", byId("f3"), p.documents, basis), {
    text: "Salgsoppgave, side 4",
    pdf: { documentId: "mock_doc_sp", page: 4 },
  });
  assert.deepEqual(factSource("nb", byId("f11"), p.documents, basis), { text: "Bilde 1", pdf: null });
  assert.deepEqual(factSource("nb", byId("f13"), p.documents, basis), { text: "Oppgitt av megler", pdf: null });
  assert.deepEqual(factSource("nb", byId("c_total_price"), p.documents, basis), {
    text: "Regnet ut fra Prisantydning, Omkostninger, Andel fellesgjeld",
    pdf: null,
  });
  assert.equal(byId("f15").material, true);
  // Dokumenttypen fra dokumentlista naar faktaen ikke har den.
  const f3 = { ...byId("f3"), source: { ...byId("f3").source!, documentKind: null } };
  assert.equal(factSource("nb", f3, p.documents, basis).text, "Salgsoppgave, side 4");
  // Utregnet uten kjente ledd, og bilde uten posisjon.
  assert.equal(factSource("nb", { ...byId("c_total_price"), inputs: ["ukjent"] }, p.documents, basis).text, "Regnet ut");
  assert.equal(factSource("nb", { ...byId("f11"), source: null }, p.documents, basis).text, "Et av bildene");
  const facts = withoutComments(read("components/annonsetekst/ListingTextFacts.tsx"));
  assert.match(facts, /\{fact\.material && <Pill tone="amber">\{t\(locale, "listingText\.sources\.material"\)\}<\/Pill>\}/);
  assert.match(facts, /\{source\.pdf !== null && \(/);
});

test("kildene: id-ene i feltet, ukjente hoppes over uten feil", async () => {
  const { p, mock } = await mockReady();
  const basis = await fetchBasis(mock.request, "asg_mock", 1);
  assert.ok(p.channels && basis);
  assert.deepEqual(fieldFactIds(p.channels, "finn.highlights"), ["f10", "f13", "f5", "f3", "f17"]);
  assert.deepEqual(fieldFactIds(p.channels, "finn.intro").slice(0, 2), ["f11", "f12"]);
  assert.deepEqual(fieldFactIds(p.channels, "social.hashtags"), []);
  assert.deepEqual(
    factsFor(basis, ["f3", "ukjent", "f3", "f13"]).map((f) => f.id),
    ["f3", "f13"]
  );
  assert.deepEqual(factsFor(null, ["f3"]), []);
  const groups = groupFacts("nb", basis.facts, p.documents);
  assert.deepEqual(
    groups.map((g) => g.title),
    [
      "Salgsoppgave · Salgsoppgave_Mockveien_1.pdf",
      "Arealmåling · Arealmaaling_Mockveien_1.pdf",
      "Tilstandsrapport · Tilstandsrapport_Mockveien_1.pdf",
      "Bildene",
      "Oppgitt av megler",
      "Regnet ut",
    ]
  );
});

// --- grunnlaget --------------------------------------------------------------

test("grunnlaget: hentes med include=basis og versjonen, og ikke i hentingen mens pakken behandles", async () => {
  const { request, calls } = fake(200, { ...SAMPLE, basis: { facts: [] } });
  const basis = await fetchBasis(request, "asg_1", 3);
  assert.deepEqual(basis?.facts, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/v1/assignments/asg_1/listing-text?version=3&include=basis");
  // Pollingen (useListingText) henter uten grunnlaget.
  const poll = withoutComments(read("hooks/useListingText.ts"));
  assert.match(poll, /getListingText\(requestRef\.current, assignmentId\)/);
  assert.doesNotMatch(poll, /includeBasis|fetchBasis/);
  // Hooken henter én gang per versjon og forsoek, ikke ved hver visning.
  const hook = withoutComments(read("hooks/useListingTextBasis.ts"));
  assert.match(hook, /const key = version === null \? null : `\$\{assignmentId\}:\$\{version\}:\$\{attempt\}`;/);
  assert.match(hook, /\}, \[assignmentId, version, key\]\);/);
  assert.match(hook, /fetchBasis\(requestRef\.current, assignmentId, version\)/);
  assert.match(hook, /retry: \(\) => setAttempt\(\(n\) => n \+ 1\)/);
  assert.equal([...hook.matchAll(/fetchBasis\(/g)].length, 1);
  const page = withoutComments(read("components/annonsetekst/ListingTextPackage.tsx"));
  assert.match(page, /useListingTextBasis\(assignmentId, request, pkg\.version\)/);
});

test("grunnlaget: feil gir melding og «Prøv igjen», resten av siden virker", async () => {
  const { request } = fake(503, { detail: { code: "listing_text_unavailable" } });
  await assert.rejects(fetchBasis(request, "asg_1", 3), (err: unknown) => {
    assert.match(String(err), /503/);
    return true;
  });
  const facts = withoutComments(read("components/annonsetekst/ListingTextFacts.tsx"));
  assert.match(facts, /basis\.kind === "idle" \|\| basis\.kind === "loading"/);
  assert.match(facts, /t\(locale, "listingText\.page\.loading"\)/);
  assert.match(facts, /t\(locale, "listingText\.basis\.error"\)/);
  assert.match(facts, /<Button variant="secondary" onClick=\{ctx\.onRetryBasis\}>/);
  // «Se grunnlag» er lukket som standard, og kildene under feltene venter paa samme grunnlag.
  const panel = withoutComments(read("components/annonsetekst/ListingTextBasisPanel.tsx"));
  assert.match(panel, /const \[open, setOpen\] = useState\(false\);/);
  assert.match(panel, /<BasisGate ctx=\{ctx\}>/);
  assert.match(panel, /"listingText\.basis\.usedInVersion"/);
  assert.match(withoutComments(read("components/annonsetekst/ListingTextChannel.tsx")), /<BasisGate ctx=\{ctx\}>/);
  assert.equal(t("nb", "listingText.page.loading"), "Henter …");
});

// --- «Åpne PDF» --------------------------------------------------------------

const SECRET = "https://lager.example/sign/listing-documents/asg_1/d1.pdf?token=HEMMELIG";

function fakeTab() {
  const events: string[] = [];
  const tab: PdfTab & { opened: string | null; closed: boolean } = {
    opened: null,
    closed: false,
    location: { replace: (url: string) => void (tab.opened = url) },
    close: () => void (tab.closed = true),
  };
  return { tab, events };
}

/** Fanger console under kallet, som i T2. */
async function captureConsole<T>(fn: () => Promise<T>): Promise<{ value: T; logged: string }> {
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const saved = methods.map((m) => console[m]);
  const lines: string[] = [];
  for (const m of methods) console[m] = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    const value = await fn();
    return { value, logged: lines.join("\n") };
  } finally {
    methods.forEach((m, i) => (console[m] = saved[i]));
  }
}

test("«Åpne PDF»: kallet, fanen aapnes i klikket og faar #page=N", async () => {
  const { request, calls } = fake(200, { url: SECRET });
  assert.equal(await getListingTextDocumentUrl(request, { id: "asg 1", documentId: "d/1" }), SECRET);
  assert.equal(calls[0].path, "/v1/assignments/asg%201/listing-text/documents/d%2F1/url");
  assert.equal(calls[0].init.method, "GET");

  const order: string[] = [];
  const { tab } = fakeTab();
  const slow: AssignmentRequest = async () => {
    order.push("request");
    return new Response(JSON.stringify({ url: SECRET }), { status: 200 });
  };
  const result = await openListingTextDocument({
    request: slow,
    id: "asg_1",
    documentId: "d1",
    page: 4,
    openTab: () => {
      order.push("openTab");
      return tab;
    },
  });
  assert.deepEqual(order, ["openTab", "request"]);
  assert.deepEqual(result, { kind: "opened" });
  assert.equal(tab.opened, `${SECRET}#page=4`);
  assert.equal(pdfHref(`${SECRET}#x`, null), SECRET);
  assert.equal(pdfHref(SECRET, 0), SECRET);
  assert.equal(pdfResultText("nb", result), null);
  // Nettleserens fane: tom fane i klikket, uten tilgang tilbake til vaar side.
  const lib = withoutComments(read("lib/listingTextPackage.ts"));
  assert.match(lib, /const tab = window\.open\("about:blank", "_blank"\);/);
  assert.match(lib, /tab\.opener = null;/);
  const order0 = lib.slice(lib.indexOf("export async function openListingTextDocument"));
  assert.ok(order0.indexOf("opts.openTab()") < order0.indexOf("await getListingTextDocumentUrl"));
});

test("«Åpne PDF»: 404 gir «Bare den som bestilte …», andre feil fra ordlista, stoppet fane og mock", async () => {
  const notFound = fake(404, { detail: "not found" });
  const { tab } = fakeTab();
  const r404 = await openListingTextDocument({ request: notFound.request, id: "a", documentId: "d", page: 1, openTab: () => tab });
  assert.deepEqual(r404, { kind: "error", code: "not_owner" });
  assert.equal(tab.closed, true);
  assert.equal(pdfResultText("nb", r404), "Bare den som bestilte, kan åpne dokumentet.");
  const busy = fake(410, { detail: { code: "media_deleted" } });
  const r410 = await openListingTextDocument({ request: busy.request, id: "a", documentId: "d", page: null, openTab: () => null });
  assert.equal(pdfResultText("nb", r410), codeText("nb", "listingTextError", "media_deleted"));
  const ok = fake(200, { url: SECRET });
  const blocked = await openListingTextDocument({ request: ok.request, id: "a", documentId: "d", page: null, openTab: () => null });
  assert.deepEqual(blocked, { kind: "blocked" });
  assert.match(pdfResultText("nb", blocked) ?? "", /stoppet den nye fanen/);
  const mockUrl = fake(200, { url: "mock://document/d" });
  const { tab: mockTab } = fakeTab();
  const mocked = await openListingTextDocument({ request: mockUrl.request, id: "a", documentId: "d", page: 2, openTab: () => mockTab });
  assert.deepEqual(mocked, { kind: "mock" });
  assert.equal(mockTab.opened, null);
  assert.equal(mockTab.closed, true);
});

test("«Åpne PDF»: lenken havner aldri i console, i feilene eller i tilstanden", async () => {
  const { tab } = fakeTab();
  const ok = fake(200, { url: SECRET });
  const opened = await captureConsole(() =>
    openListingTextDocument({ request: ok.request, id: "a", documentId: "d", page: 3, openTab: () => tab })
  );
  assert.doesNotMatch(opened.logged, /HEMMELIG|lager\.example/);
  assert.doesNotMatch(JSON.stringify(opened.value), /HEMMELIG|lager\.example/);
  // Feil etter at lenken er hentet (fanen er stoppet): resultatet har ingen lenke.
  const blocked = await captureConsole(() =>
    openListingTextDocument({ request: ok.request, id: "a", documentId: "d", page: 3, openTab: () => null })
  );
  assert.doesNotMatch(blocked.logged + JSON.stringify(blocked.value), /HEMMELIG/);
  // Et svar uten gyldig url gir feilen invalid_response uten innholdet.
  const bad = fake(200, { url: 42, other: SECRET });
  const err = await captureConsole(() => getListingTextDocumentUrl(bad.request, { id: "a", documentId: "d" }).catch((e: unknown) => e));
  assert.doesNotMatch(String(err.value) + JSON.stringify(err.value) + err.logged, /HEMMELIG/);
  // Kildene: ingen console, ingen lenke i adressen vaar, og PdfState har bare resultatet.
  for (const rel of [...NEW_COMPONENTS, ...NEW_MODULES]) {
    const src = withoutComments(read(rel));
    assert.doesNotMatch(src, /\bconsole\./, rel);
    assert.doesNotMatch(src, /router\.(push|replace)|history\.(push|replace)State|window\.location|location\.(href|assign)/, rel);
  }
  const facts = withoutComments(read("components/annonsetekst/ListingTextFacts.tsx"));
  assert.match(facts, /export type PdfState = \{ key: string; state: \{ kind: "opening" \} \| PdfResult \} \| null;/);
  assert.doesNotMatch(facts.match(/export type PdfState[^;]*;/)?.[0] ?? "", /url/i);
});

// --- kildekoden --------------------------------------------------------------

test("kilden: ingen tekst i JSX utenom ordlista, ingen dangerouslySetInnerHTML og ingen fetch direkte", () => {
  for (const rel of NEW_COMPONENTS) {
    const src = read(rel);
    assert.deepEqual(literalTextsInFile(src), [], rel);
    assert.doesNotMatch(src, /dangerouslySetInnerHTML|innerHTML/, rel);
    assert.doesNotMatch(withoutComments(src), /\bfetch\(|API_BASE/, rel);
  }
  for (const rel of NEW_MODULES) {
    assert.doesNotMatch(withoutComments(read(rel)), /\bfetch\(|API_BASE|innerHTML/, rel);
  }
  // Plassholderen fra T2 er byttet med pakken.
  const order = withoutComments(read("components/annonsetekst/ListingTextOrder.tsx"));
  assert.match(order, /<ListingTextPackage\s/);
  assert.match(order, /openTab=\{deps\?\.openTab \?\? browserOpenTab\}/);
  assert.doesNotMatch(order, /listingText\.ready\.placeholder/);
});

// --- mock-pakken -------------------------------------------------------------

test("mock: full oppdiktet pakke etter «Behandles», med det T3 skal vise", async () => {
  const { p, mock } = await mockReady();
  assert.equal(p.displayStatus, "to_review");
  assert.equal(p.version, 1);
  assert.ok(p.channels?.finn && p.channels.social && p.channels.email);
  const finn = p.channels.finn;
  assert.ok(worthKnowing(finn.body));
  assert.ok(finn.body.some((b) => b.check === "partial"));
  assert.deepEqual(p.issues.map((i) => [i.code, i.severity]).sort(), [
    ["conflicting_bra_i", "material"],
    ["length_outside_target", "info"],
    ["meta_reference", "material"],
  ]);
  assert.equal(p.issues.find((i) => i.code === "meta_reference")?.message, "Teksten viser til kildene i stedet for boligen.");
  // Bare naermiljoeet er utenfor maalet, og avviket har samme tall som tellingen.
  const measured = measureChannels(p.channels);
  const outside = (Object.entries(measured) as [LengthPath, number][])
    .filter(([path, n]) => checkLength(path, n).status !== "ok")
    .map(([path]) => path);
  assert.deepEqual(outside, ["finn.neighbourhood"]);
  assert.equal(outsideTarget(p.issues, "finn.neighbourhood"), true);
  assert.match(p.issues.find((i) => i.code === "length_outside_target")?.message ?? "", new RegExp(`^${measured["finn.neighbourhood"]} ord;`));
  assert.deepEqual(
    p.keyFacts.filter((k) => k.status !== "found").map((k) => [k.key, k.status]),
    [
      ["bra_i", "conflict"],
      ["energy_label", "missing"],
    ]
  );
  // Kopi som backend lager den.
  assert.match(copyTextFor(p.channels, "finn.highlights") ?? "", /^• Sørvestvendt balkong på 7 m²\n• /);
  assert.match(copyTextFor(p.channels, "social.post") ?? "", /\n\n#mockbyen #oslo #nyttkjøkken$/);
  // Grunnlaget bare med include=basis, med alle fire kildetypene.
  assert.equal(p.basis, null);
  const basis = await fetchBasis(mock.request, "asg_mock", 1);
  assert.deepEqual([...new Set(basis?.facts.map((f) => f.kind))].sort(), ["broker", "computed", "document", "visual"]);
  assert.equal(statusTone(p.displayStatus), "amber");
  assert.equal(lastRunFailedText("nb", p), null);
});

test("mock: lenken er mock:// og aapnes ikke, arealmaalingen gir 404, og adressen er oppdiktet", async () => {
  const { mock } = await mockReady();
  assert.equal(await getListingTextDocumentUrl(mock.request, { id: "asg_mock", documentId: "mock_doc_sp" }), "mock://document/mock_doc_sp");
  assert.equal(mock.openTab(), null);
  const mocked = await openListingTextDocument({ request: mock.request, id: "asg_mock", documentId: "mock_doc_sp", page: 4, openTab: mock.openTab });
  assert.deepEqual(mocked, { kind: "mock" });
  assert.equal(pdfResultText("nb", mocked), "Mock-modus: PDF-en åpnes ikke.");
  const denied = await openListingTextDocument({ request: mock.request, id: "asg_mock", documentId: "mock_doc_area", page: 1, openTab: mock.openTab });
  assert.deepEqual(denied, { kind: "error", code: "not_owner" });
  const res = await mock.request("/v1/assignments/asg_mock", { method: "GET" });
  assert.equal(((await res.json()) as { address: string }).address, "Mockveien 1, 0000 Oslo");
});

test("toppen: status, versjon og linja om at siste forsoek feilet", () => {
  const raw = clone(SAMPLE);
  raw.last_run = { id: "r", status: "failed", error_code: "timeout" };
  const p = pkg(raw);
  assert.equal(lastRunFailedText("nb", p), "Siste forsøk feilet: Det tok for lang tid. Prøv igjen. Du ser versjon 3.");
  assert.equal(statusTone("approved"), "green");
  assert.equal(statusTone("failed"), "red");
  assert.equal(statusTone(null), "neutral");
  const page = withoutComments(read("components/annonsetekst/ListingTextPackage.tsx"));
  assert.match(page, /t\(locale, listingTextStatusKey\(pkg\.displayStatus\)\)/);
  assert.match(page, /"listingText\.package\.version", \{ n: pkg\.version \}/);
});

// --- ordlista ----------------------------------------------------------------

const NEW_UI = (Object.keys(DICTIONARIES.nb.ui) as UiKey[]).filter((k) =>
  /^listingText\.(package|issues|keyFacts|channels|channel|field|length|check|sources|pdf|basis)\./.test(k)
);

test("ordlista: de nye noeklene paa nb og en, med samme plassholdere", () => {
  assert.ok(NEW_UI.length >= 50, String(NEW_UI.length));
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of NEW_UI) {
    const nb = DICTIONARIES.nb.ui[key];
    const en = DICTIONARIES.en.ui[key];
    assert.ok(nb && en, key);
    assert.deepEqual(vars(nb), vars(en), key);
  }
  for (const locale of ["nb", "en"] as const) {
    assert.deepEqual(Object.keys(DICTIONARIES[locale].codes.listingTextField).sort(), [
      "email.body",
      "email.preheader",
      "email.signature",
      "email.subject",
      "finn.body",
      "finn.headline",
      "finn.highlights",
      "finn.intro",
      "finn.neighbourhood",
      "social.fact_line",
      "social.hashtags",
      "social.post",
    ]);
  }
  assert.equal(t("nb", "listingText.sources.show"), "Vis kilder");
  assert.equal(t("nb", "listingText.basis.show"), "Se grunnlag");
  assert.equal(t("nb", "listingText.sources.broker"), "Oppgitt av megler");
  assert.equal(t("nb", "listingText.sources.computed"), "Regnet ut");
  assert.equal(t("nb", "listingText.basis.usedInVersion"), "Brukt i denne versjonen");
  assert.equal(t("nb", "review.copied"), "Kopiert");
  assert.equal(t("nb", "listingText.sources.openPdf"), "Åpne PDF");
  assert.equal(Object.hasOwn(DICTIONARIES.nb.ui, "listingText.ready.placeholder"), false);
});
