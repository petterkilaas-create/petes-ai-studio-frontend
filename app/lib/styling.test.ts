import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./testing/jsxText.ts";

// S2-f: bestilling av Digital styling bak ENABLED.digital_styling (paa fra S4).
// Kontrakt: ~/dev/_handoff/KONTRAKT_BESTILLING.md. api.ts kaster ved import
// uten NEXT_PUBLIC_API_BASE; fetch byttes ut, ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { OrderKeys } = await import("./orderKey.ts");
const { DICTIONARIES, codeText, orderErrorText, t } = await import("./i18n/index.ts");
const { ENABLED, expressCategories, isServiceEnabled, orderableTools, toolFromParam, visibleCategories } =
  await import("./services.ts");
const { presetFileSlug, presetLabelKey, presetWorkingKey, shownPanels } = await import("./presets.ts");
const { downloadFileName } = await import("./download.ts");
const styling = await import("./styling.ts");
const {
  EMPTY_STYLING,
  FURNISH_AS_CHOICES,
  MAX_ORDER_JOBS,
  STYLING_ORDER_SERVICE,
  STYLING_STYLES,
  orderStatus,
  orderPollDelayMs,
  pollJobId,
  styleShort,
  stylingParams,
  toggleStyle,
} = styling;

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const getToken = async () => "tok";
const image = () => new File([new Uint8Array([1])], "rom.jpg", { type: "image/jpeg" });

interface Seen {
  url: string;
  headers: Headers;
  form: FormData;
}

/** Svarer med `responses` i tur og orden og husker url, headere og skjema i hvert kall. */
function scriptFetch(responses: { status: number; body: unknown }[]): Seen[] {
  const seen: Seen[] = [];
  let i = 0;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    seen.push({ url: String(url), headers: new Headers(init?.headers), form: init?.body as FormData });
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return seen;
}

const ACCEPTED = {
  status: 202,
  body: {
    order_id: "ord_1",
    duplicate: false,
    jobs: [
      { preset_id: "styling_moderne_nordisk", job_id: "j1", status: "queued", status_url: "/v1/jobs/j1" },
      { preset_id: "styling_japandi", job_id: "j2", status: "queued", status_url: "/v1/jobs/j2" },
      { preset_id: "styling_nordisk_kyst", job_id: null, status: "not_started", code: "capacity" },
    ],
    quota: { limited: true, used: 1, limit: 3, remaining: 2 },
  },
};

const EIGHT = [
  "styling_moderne_nordisk",
  "styling_varm_minimalisme",
  "styling_japandi",
  "styling_nordisk_klassisk",
  "styling_dansk_farge",
  "styling_by_vintage",
  "styling_hytte_fjell",
  "styling_nordisk_kyst",
] as const;

/** Et komplett valg med de gitte stilene. */
const choice = (furnishAs: (typeof FURNISH_AS_CHOICES)[number], styles: readonly (typeof EIGHT)[number][] = ["styling_japandi"]) => ({
  furnishAs,
  roomEmpty: true,
  styles: [...styles],
});

// --- Flagget og kortet ----------------------------------------------------------

test("S4: ENABLED.digital_styling er true, og kortet kan bestilles paa start og Tjenester", () => {
  assert.equal(ENABLED.digital_styling, true);
  assert.equal(isServiceEnabled("digital_styling"), true);
  // Start (snarveiene) og Tjenester bruker orderableTools/expressCategories.
  assert.ok(orderableTools().some((t) => t.id === "digital_styling"));
  assert.ok(expressCategories().some((c) => c.id === "furnishing"));
  assert.deepEqual(toolFromParam("digital_styling"), { categoryId: "furnishing", toolId: "digital_styling" });
  // Paa Tjenester er kortet valgbart, ikke lenger «Kommer».
  const card = visibleCategories().flatMap((c) => c.items).find((t) => t.id === "digital_styling");
  assert.ok(card);
  assert.equal(card.orderable, true);
  assert.equal(card.service, "scene_transform");
  assert.equal(card.kind, "styling");
});

// --- Presetene ------------------------------------------------------------------

test("S3-f: STYLING_STYLES er de aatte i fast rekkefoelge, og MAX_ORDER_JOBS er 8", () => {
  assert.deepEqual([...STYLING_STYLES], [...EIGHT]);
  assert.equal(MAX_ORDER_JOBS, STYLING_STYLES.length);
  assert.equal(MAX_ORDER_JOBS, 8);
  assert.equal(styleShort("styling_by_vintage"), "by_vintage");
});

test("S3-f: de aatte stilene har kortetikett, ventetekst og et filnavn som bare nevner stilen", () => {
  for (const preset of STYLING_STYLES) {
    const short = styleShort(preset);
    const key = presetLabelKey("scene_transform", preset);
    assert.equal(key, `styling.preset.${short}`, preset);
    assert.equal(DICTIONARIES.nb.ui[key!], `Digital styling – ${DICTIONARIES.nb.ui[`styling.style.${short}`]}`);
    assert.equal(DICTIONARIES.en.ui[key!], `Virtual staging – ${DICTIONARIES.en.ui[`styling.style.${short}`]}`);
    assert.equal(presetWorkingKey("scene_transform", preset), "media.working.styling");
    const slug = `styling-${short.replaceAll("_", "-")}`;
    assert.equal(presetFileSlug(preset), slug);
    assert.equal(downloadFileName("250dccaf-0000", preset), `${slug}-ai_250dccaf.jpg`);
  }
  assert.equal(presetFileSlug("styling_moderne_nordisk"), "styling-moderne-nordisk");
  assert.equal(presetFileSlug("styling_by_vintage"), "styling-by-vintage");
  assert.equal(t("nb", "styling.preset.dansk_farge"), "Digital styling – Dansk fargemoderne");
  assert.equal(t("en", "styling.preset.hytte_fjell"), "Virtual staging – Cabin and mountain");
  // De tre gamle staar igjen for historikken.
  const old = { styling_skandinavisk: "skandinavisk", styling_familie: "familie", styling_moderne: "moderne" };
  for (const [preset, slug] of Object.entries(old)) {
    const key = presetLabelKey("scene_transform", preset);
    assert.ok(key, preset);
    assert.equal(DICTIONARIES.nb.ui[key], `Digital styling – ${slug}`);
    assert.ok(DICTIONARIES.en.ui[key].startsWith("Virtual staging – "), preset);
    assert.equal(presetWorkingKey("scene_transform", preset), "media.working.styling");
    assert.equal(presetFileSlug(preset), `styling-${slug}`);
  }
  assert.equal(t("nb", "media.working.styling"), "Møblerer rommet …");
  assert.equal(t("en", "media.working.styling"), "Furnishing the room …");
  // Skumring og Klart vaer er uendret.
  assert.equal(presetFileSlug("skumring"), "kveldsbilde");
  assert.equal(presetFileSlug("klart_vaer"), "blaahimmel");
});

test("S2-f: ingen tekst om styling nevner rommet i filnavnet eller lover samme moebler", () => {
  for (const preset of STYLING_STYLES) {
    assert.doesNotMatch(presetFileSlug(preset), /stue|soverom|kjokken|bad|gang|balkong|living|bedroom/);
  }
  for (const locale of ["nb", "en"] as const) {
    const ui = DICTIONARIES[locale].ui;
    for (const key of Object.keys(ui).filter((k) => k.startsWith("styling.") || k === "media.working.styling")) {
      assert.doesNotMatch(ui[key as keyof typeof ui], /samme møbler|same furniture/i, `${locale} ${key}`);
    }
  }
});

// --- Velgeren -------------------------------------------------------------------

// B2 (Petter 22.10 kl. 17.48): barnerom og kontor er med, i rekkefoelgen til ST_ROOM i backend.
test("B2: velgeren viser ni valg, med barnerom og kontor", () => {
  assert.deepEqual(
    [...FURNISH_AS_CHOICES],
    [
      "living",
      "living_dining",
      "bedroom",
      "kids_room",
      "kitchen_dining",
      "bathroom_decor",
      "hallway",
      "home_office",
      "balcony_terrace",
    ]
  );
  const picker = read("components/StylingChoicePicker.tsx");
  assert.match(picker, /FURNISH_AS_CHOICES\.map\(/);
  assert.match(picker, /codeText\(locale, "furnishAs", room\)/);
  assert.doesNotMatch(picker, /kids_room|home_office/);
  assert.equal(codeText("nb", "furnishAs", "kids_room"), "Møbler som barnerom");
  assert.equal(codeText("nb", "furnishAs", "home_office"), "Møbler som kontor");
  assert.equal(codeText("en", "furnishAs", "kids_room"), "Furnish as children's room");
  assert.equal(codeText("en", "furnishAs", "home_office"), "Furnish as home office");
  assert.equal(stylingParams(choice("kids_room"))?.furnish_as, "kids_room");
  assert.equal(stylingParams(choice("home_office"))?.furnish_as, "home_office");
});

test("S2-f: etiketten er «Møbler som …», aldri bare «Soverom», paa nb og en", () => {
  for (const locale of ["nb", "en"] as const) {
    const group = DICTIONARIES[locale].codes.furnishAs;
    assert.deepEqual(Object.keys(group).sort(), [...FURNISH_AS_CHOICES].sort(), locale);
    for (const room of FURNISH_AS_CHOICES) {
      const text = codeText(locale, "furnishAs", room);
      assert.match(text, locale === "nb" ? /^Møbler som / : /^Furnish as /, `${locale}/${room}`);
    }
  }
  assert.equal(codeText("nb", "furnishAs", "bedroom"), "Møbler som soverom");
  assert.equal(codeText("nb", "furnishAs", "living"), "Møbler som stue");
  for (const text of Object.values(DICTIONARIES.nb.codes.furnishAs)) assert.notEqual(text, "Soverom");
});

test("S2-f/S3-f: stilene staar over romvalget, og ingen tekst eller spoersmaal under romvalget, og soverom kan bestilles", () => {
  const picker = read("components/StylingChoicePicker.tsx");
  // Stilgruppen (overskrift, hjelpelinje, etikett og kortbeskrivelse), saa
  // romvalget og avkrysningen. Ingenting mellom romvalget og avkrysningen.
  assert.deepEqual(picker.match(/t\(locale, ["`][^"`]+["`]\)/g), [
    't(locale, "styling.styles")',
    't(locale, "styling.stylesHelp")',
    't(locale, "styling.styles")',
    "t(locale, `styling.style.${short}`)",
    "t(locale, `styling.styleDesc.${short}`)",
    't(locale, "styling.furnishAs")',
    't(locale, "styling.furnishAs")',
    't(locale, "styling.roomEmpty")',
  ]);
  assert.doesNotMatch(picker, /aria-live|bedroomHint/);
  for (const locale of ["nb", "en"] as const) {
    assert.ok(!Object.keys(DICTIONARIES[locale].ui).some((k) => /bedroomHint/.test(k)), locale);
  }
  // Soverom sperres ikke: med kryss og stil kan det bestilles.
  assert.notEqual(stylingParams(choice("bedroom")), null);
});

test("S3-f: velgeren har aatte stilknapper med aria-pressed, og hver stil har etikett og kortbeskrivelse paa nb og en", () => {
  const picker = read("components/StylingChoicePicker.tsx");
  assert.match(picker, /STYLING_STYLES\.map\(/);
  assert.match(picker, /aria-pressed=\{on\}/);
  assert.match(picker, /onChange\(\{ \.\.\.value, styles: toggleStyle\(value\.styles, style\) \}\)/);
  assert.match(picker, /grid grid-cols-1 md:grid-cols-2/);
  assert.match(picker, /const STYLE_OPTION =\s*"min-h-11 [^"]*text-left[^"]*focus-visible:ring-2 focus-visible:ring-accent/);
  assert.match(picker, /\$\{STYLE_OPTION\} \$\{on \? ON : OFF\}/);
  // Stilgruppen staar foer romvalget.
  assert.ok(picker.indexOf("STYLING_STYLES.map(") < picker.indexOf("FURNISH_AS_CHOICES.map("));
  const nb = DICTIONARIES.nb.ui;
  const en = DICTIONARIES.en.ui;
  assert.equal(nb["styling.styles"], "Velg én eller flere stiler");
  assert.equal(nb["styling.stylesHelp"], "Du får ett bilde per stil. Bestillingen teller som ett gratisbilde.");
  assert.equal(en["styling.styles"], "Choose one or more styles");
  assert.equal(en["styling.stylesHelp"], "You get one image per style. The order counts as one free image.");
  for (const style of STYLING_STYLES) {
    const short = styleShort(style);
    for (const ui of [nb, en]) {
      assert.ok(ui[`styling.style.${short}`].trim().length > 0, short);
      assert.ok(ui[`styling.styleDesc.${short}`].trim().length > 0, short);
    }
  }
  assert.equal(nb["styling.style.moderne_nordisk"], "Moderne nordisk");
  assert.equal(nb["styling.styleDesc.nordisk_klassisk"], "Eldre bybolig: krem, støvet blått og mørkere tre.");
  assert.equal(en["styling.style.by_vintage"], "Urban vintage");
  assert.equal(en["styling.styleDesc.nordisk_kyst"], "Bright by the sea: linen white, sand and light blue.");
});

test("S3-f: toggleStyle legger til og tar bort, og stylingParams sorterer i fast rekkefoelge uten duplikater", () => {
  assert.deepEqual(toggleStyle([], "styling_japandi"), ["styling_japandi"]);
  assert.deepEqual(toggleStyle(["styling_japandi"], "styling_by_vintage"), ["styling_japandi", "styling_by_vintage"]);
  assert.deepEqual(toggleStyle(["styling_japandi", "styling_by_vintage"], "styling_japandi"), ["styling_by_vintage"]);
  assert.deepEqual(toggleStyle(["styling_japandi"], "styling_japandi"), []);
  // Valgt i tilfeldig rekkefoelge (og med et duplikat): sendt i den faste.
  const params = stylingParams(
    choice("living", ["styling_nordisk_kyst", "styling_japandi", "styling_moderne_nordisk", "styling_japandi"])
  );
  assert.deepEqual(params?.styles, ["styling_moderne_nordisk", "styling_japandi", "styling_nordisk_kyst"]);
  // Alle aatte, baklengs.
  assert.deepEqual(stylingParams(choice("living", [...EIGHT].reverse()))?.styles, [...EIGHT]);
  // Samme valg i ulik rekkefoelge gir samme noekkel.
  let n = 0;
  const keys = new OrderKeys(() => `key-${++n}`);
  const file = image();
  const a = stylingParams(choice("living", ["styling_japandi", "styling_hytte_fjell"]))!;
  const b = stylingParams(choice("living", ["styling_hytte_fjell", "styling_japandi"]))!;
  assert.equal(
    keys.keyFor({ file, service: STYLING_ORDER_SERVICE, params: a }),
    keys.keyFor({ file, service: STYLING_ORDER_SERVICE, params: b })
  );
});

test("S3-f: orderPollDelayMs er 2 s × ⌈n/3⌉, minst 2 s", () => {
  for (const n of [0, 1, 2, 3]) assert.equal(orderPollDelayMs(n), 2000, String(n));
  for (const n of [4, 5, 6]) assert.equal(orderPollDelayMs(n), 4000, String(n));
  for (const n of [7, 8]) assert.equal(orderPollDelayMs(n), 6000, String(n));
});

// --- Avkrysningen ---------------------------------------------------------------

test("S2-f/S3-f: «Bestill» er av uten kryss, uten romtype og uten stil", () => {
  assert.equal(t("nb", "styling.roomEmpty"), "Rommet er tomt for løse møbler");
  assert.equal(t("en", "styling.roomEmpty"), "The room is empty of loose furniture");
  assert.equal(t("nb", "styling.order"), "Bestill");
  // Ingen stil er forhaandsvalgt.
  assert.deepEqual(EMPTY_STYLING, { furnishAs: null, roomEmpty: false, styles: [] });
  assert.equal(stylingParams({ ...choice("living"), roomEmpty: false }), null);
  assert.equal(stylingParams({ ...choice("living"), furnishAs: null }), null);
  assert.equal(stylingParams({ ...choice("living"), styles: [] }), null);
  assert.equal(stylingParams(EMPTY_STYLING), null);
  // Siden: knappen er av naar stylingParams gir null, og et nytt bilde fjerner krysset.
  const page = read("(app)/tjenester/page.tsx");
  assert.match(page, /\(isStyling && stylingParams\(styling\) === null\)/);
  assert.match(page, /<Button onClick=\{handleRun\} disabled=\{runDisabled\}>/);
  assert.match(page, /setStyling\(\(s\) => \(\{ \.\.\.s, roomEmpty: false \}\)\)/);
});

// --- Kallet -----------------------------------------------------------------------

test("S2-f: kallet sender riktig params_json, ett bilde og ingen service", async () => {
  const params = stylingParams(choice("living", ["styling_nordisk_kyst", "styling_moderne_nordisk", "styling_japandi"]));
  assert.ok(params);
  assert.deepEqual(params, {
    styles: ["styling_moderne_nordisk", "styling_japandi", "styling_nordisk_kyst"],
    furnish_as: "living",
    room_empty_confirmed: true,
  });
  const seen = scriptFetch([ACCEPTED]);
  const file = image();
  await api.submitStylingOrder({ image: file, params, idempotencyKey: "k-1", getToken });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "http://api.test/v1/orders/styling");
  assert.equal(seen[0].headers.get("Idempotency-Key"), "k-1");
  assert.equal(seen[0].headers.get("Authorization"), "Bearer tok");
  const form = seen[0].form;
  assert.deepEqual([...form.keys()].sort(), ["image", "params_json"]);
  assert.equal(form.getAll("image").length, 1);
  assert.deepEqual(JSON.parse(String(form.get("params_json"))), {
    styles: ["styling_moderne_nordisk", "styling_japandi", "styling_nordisk_kyst"],
    furnish_as: "living",
    room_empty_confirmed: true,
  });
});

test("S2-f: én noekkel per bestilling, ogsaa ved dobbeltklikk og nytt forsoek", async () => {
  let n = 0;
  const keys = new OrderKeys(() => `key-${++n}`);
  const file = image();
  const params = stylingParams(choice("bedroom"))!;
  const order = { file, service: STYLING_ORDER_SERVICE, params };

  // Dobbeltklikk: to kall foer svaret kommer, samme noekkel i begge.
  const seen = scriptFetch([ACCEPTED, ACCEPTED]);
  await Promise.all([
    api.submitStylingOrder({ image: file, params, idempotencyKey: keys.keyFor(order), getToken }),
    api.submitStylingOrder({ image: file, params, idempotencyKey: keys.keyFor(order), getToken }),
  ]);
  assert.deepEqual(seen.map((s) => s.headers.get("Idempotency-Key")), ["key-1", "key-1"]);

  // Mottatt: neste klikk er en ny bestilling. Et annet rom er ogsaa en ny bestilling.
  keys.accepted();
  assert.equal(keys.keyFor(order), "key-2");
  assert.equal(keys.keyFor({ ...order, params: stylingParams(choice("living"))! }), "key-3");

  // Hooken: noekkelen lages foer kallet, og et klikk mens kallet gaar, sendes ikke.
  const hook = read("hooks/useOrderJobs.ts");
  assert.match(hook, /if \(inFlightRef\.current\) return;/);
  assert.match(hook, /orderKeys\.keyFor\(\{ file, service: STYLING_ORDER_SERVICE, params \}\)/);
  assert.match(hook, /orderKeys\.accepted\(\);/);
});

test("S2-f: svaret leses strengt, og not_started gir et kort uten polling", async () => {
  scriptFetch([ACCEPTED]);
  const r = await api.submitStylingOrder({
    image: image(),
    params: stylingParams(choice("hallway"))!,
    getToken,
  });
  assert.equal(r.orderId, "ord_1");
  assert.equal(r.duplicate, false);
  assert.deepEqual(r.quota, { limited: true, used: 1, limit: 3, remaining: 2 });
  assert.deepEqual(r.jobs, [
    { presetId: "styling_moderne_nordisk", jobId: "j1", status: "queued", code: null },
    { presetId: "styling_japandi", jobId: "j2", status: "queued", code: null },
    { presetId: "styling_nordisk_kyst", jobId: null, status: "not_started", code: "capacity" },
  ]);
  assert.deepEqual(r.jobs.map(pollJobId), ["j1", "j2", null]);
  assert.equal(pollJobId(undefined), null);
  // not_started polles aldri, ogsaa om backend skulle sende en id.
  const odd = api.parseStylingOrder({ jobs: [{ preset_id: "styling_japandi", job_id: "x", status: "not_started" }] });
  assert.equal(odd.jobs[0].jobId, null);
  assert.equal(pollJobId(odd.jobs[0]), null);
  // Duplikat: not_started med code null.
  const dup = api.parseStylingOrder({
    order_id: "ord_1",
    duplicate: true,
    jobs: [{ preset_id: "styling_nordisk_kyst", job_id: null, status: "not_started", code: null }],
    quota: { limited: false },
  });
  assert.equal(dup.duplicate, true);
  assert.deepEqual(dup.quota, { limited: false });
  assert.deepEqual(dup.jobs, [{ presetId: "styling_nordisk_kyst", jobId: null, status: "not_started", code: null }]);
  // Oedelagt svar krasjer ikke.
  assert.deepEqual(api.parseStylingOrder(null), { orderId: "", duplicate: false, jobs: [], quota: null });
  // Hooken poller med pollJobId, og null gjoer ingen kall.
  const jobStatus = read("lib/useJobStatus.ts");
  assert.match(jobStatus, /if \(!jobId\) \{[^}]*return;\s*\}/);
});

test("S3-f: hooken har aatte faste useJobStatus-kall med minDelayMs, og useJobStatus bruker det bare for pending", () => {
  const hook = read("hooks/useOrderJobs.ts");
  assert.match(hook, /const pollOptions = \{ minDelayMs: orderPollDelayMs\(jobs\.length\) \};/);
  for (let i = 0; i < 8; i++) {
    assert.match(hook, new RegExp(`useJobStatus\\(pollJobId\\(jobs\\[${i}\\]\\), pollOptions\\)`), String(i));
  }
  assert.equal(hook.match(/useJobStatus\(/g)?.length, 8);
  assert.doesNotMatch(hook, /jobs\[8\]/);
  assert.match(hook, /jobs\.slice\(0, polls\.length\)/);

  const jobStatus = read("lib/useJobStatus.ts");
  assert.match(jobStatus, /export function useJobStatus\(jobId: string \| null, options: UseJobStatusOptions = \{\}\)/);
  // Bare et svar (pending) faar minDelayMs; backoff etter en feil er uendret.
  assert.match(jobStatus, /schedule\(outcome\.ok \? Math\.max\(step\.delayMs, minDelayMsRef\.current\) : step\.delayMs\)/);
  assert.equal(jobStatus.match(/schedule\(/g)?.length, 1, "ett kall til schedule");
  // Verdien leses gjennom en ref: pollingen startes ikke paa nytt.
  assert.match(jobStatus, /\}, \[jobId, getToken\]\);/);
  // De andre kallene er uendret.
  assert.match(read("hooks/useProcessJob.ts"), /useJobStatus\(jobId\);/);
  assert.match(read("(app)/godkjenning/[jobId]/page.tsx"), /useJobStatus\(activePollId\);/);
});

test("S3-f: et svar med aatte jobber der 5–8 er not_started, gir aatte kort, og 5–8 polles ikke", () => {
  const r = api.parseStylingOrder({
    order_id: "ord_8",
    duplicate: false,
    jobs: EIGHT.map((preset_id, i) =>
      i < 4
        ? { preset_id, job_id: `j${i + 1}`, status: "queued", status_url: `/v1/jobs/j${i + 1}` }
        : { preset_id, job_id: null, status: "not_started", code: "capacity" }
    ),
    quota: { limited: true, used: 1, limit: 3, remaining: 2 },
  });
  assert.equal(r.jobs.length, 8);
  assert.deepEqual(r.jobs.map((j) => j.presetId), [...EIGHT]);
  assert.deepEqual(r.jobs.map(pollJobId), ["j1", "j2", "j3", "j4", null, null, null, null]);
  // Kortene: jobs.slice(0, polls.length) med aatte kall (testen over) beholder alle aatte.
  assert.equal(r.jobs.slice(0, MAX_ORDER_JOBS).length, 8);
  // Kortene vises i to kolonner fra md og fire fra lg.
  const cards = read("components/StylingOrderCards.tsx");
  assert.match(cards, /grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6/);
  assert.doesNotMatch(cards, /md:grid-cols-3/);
});

test("S2-f: tekst for not_started og samlet status for bestillingen", () => {
  assert.equal(
    codeText("nb", "orderNotStarted", "capacity"),
    "Denne stilen ble ikke laget fordi tjenesten var travel. Bestillingen teller som én."
  );
  assert.equal(codeText("nb", "orderNotStarted", null), "Denne stilen ble ikke laget. Bestillingen teller som én.");
  assert.notEqual(codeText("en", "orderNotStarted", "capacity"), codeText("en", "orderNotStarted", null));

  const card = (status: "running" | "awaiting_approval" | "failed" | "done" | "idle", notStarted = false) => ({
    status,
    notStarted,
  });
  assert.equal(orderStatus({ isSubmitting: true, failed: false, cards: [] }), "uploading");
  assert.equal(orderStatus({ isSubmitting: false, failed: true, cards: [] }), "failed");
  assert.equal(orderStatus({ isSubmitting: false, failed: false, cards: [] }), "idle");
  assert.equal(
    orderStatus({ isSubmitting: false, failed: false, cards: [card("running"), card("idle", true)] }),
    "running"
  );
  assert.equal(
    orderStatus({ isSubmitting: false, failed: false, cards: [card("awaiting_approval"), card("idle", true)] }),
    "awaiting_approval"
  );
  // Alle feilet eller ikke startet: feilet (kvoten kan vaere gitt tilbake).
  assert.equal(
    orderStatus({ isSubmitting: false, failed: false, cards: [card("failed"), card("idle", true)] }),
    "failed"
  );
  assert.equal(orderStatus({ isSubmitting: false, failed: false, cards: [card("done"), card("done")] }), "done");
});

// --- Feilkodene -------------------------------------------------------------------

test("S2-f: feilkodene har egen tekst paa begge spraak", () => {
  for (const locale of ["nb", "en"] as const) {
    const dict = DICTIONARIES[locale];
    for (const code of ["service_disabled", "invalid_order", "room_empty_not_confirmed", "order_required"]) {
      const text = orderErrorText(locale, code, null);
      assert.ok(text.trim().length > 0, `${locale}/${code}`);
      assert.notEqual(text, dict.generic.orderError, `${locale}/${code}`);
    }
    // Porten for romtypen (S2) er en grunn i needs_review, ikke en bestillingsfeil.
    const mismatch = codeText(locale, "reasonCode", "furnish_as_mismatch");
    assert.notEqual(mismatch, dict.generic.reasonCode, locale);
  }
  assert.equal(orderErrorText("nb", "room_empty_not_confirmed", null), "Bekreft at rommet er tomt.");
  assert.equal(orderErrorText("en", "room_empty_not_confirmed", null), "Please confirm that the room is empty.");
  assert.equal(
    orderErrorText("nb", "invalid_order", null),
    "Bestillingen er ikke gyldig. Velg rom og minst én stil."
  );
});

test("S2-f: 400, 403 og 402 fra bestillingen kastes med koden, som i submitJob", async () => {
  const params = stylingParams(choice("living"))!;
  const cases: [number, unknown, string][] = [
    [400, { detail: { code: "room_empty_not_confirmed" } }, "room_empty_not_confirmed"],
    [400, { detail: { code: "invalid_order" } }, "invalid_order"],
    [403, { detail: { code: "service_disabled", rejected: "styling_moderne_nordisk" } }, "service_disabled"],
    [402, { detail: { code: "free_quota_exhausted", used: 3, limit: 3 } }, "free_quota_exhausted"],
  ];
  for (const [status, body, code] of cases) {
    scriptFetch([{ status, body }]);
    await assert.rejects(
      api.submitStylingOrder({ image: image(), params, getToken }),
      (err: unknown) => err instanceof api.SubmitError && err.httpStatus === status && err.code === code,
      code
    );
  }
  // 400 uten kode (f.eks. tomt bilde) er en ValidationError, som i submitJob.
  scriptFetch([{ status: 400, body: { detail: "Empty file" } }]);
  await assert.rejects(api.submitStylingOrder({ image: image(), params, getToken }), api.ValidationError);
});

// --- Gjennomgangen ----------------------------------------------------------------

test("S2-f: gjennomgangen har ingen paneler for styling, og «Ikke kontrollert» og «Original først» finnes", () => {
  // Backend sender review_panels: [] for styling: ingen paneler vises.
  assert.deepEqual(shownPanels([]), []);
  assert.equal(t("nb", "additions.unchecked"), "Ikke kontrollert automatisk.");
  assert.equal(t("nb", "review.originalFirst"), "Bruk originalbildet som hovedbilde i annonsen, ikke det møblerte.");
  const disclosure = read("components/godkjenning/DisclosureBlock.tsx");
  assert.match(disclosure, /disclosure\?\.base === "furniture_added" &&/);
});

// ---------------------------------------------------------------------------
// B2 (dag 51): stilen paa godkjenningssiden, og ingressen.
// ---------------------------------------------------------------------------

test("B2: isStylingPreset og styleText", () => {
  const { isStylingPreset, styleText } = styling;
  for (const id of [...STYLING_STYLES, "styling_skandinavisk", "styling_ukjent"]) assert.equal(isStylingPreset(id), true, id);
  for (const id of ["skumring", "skumring_interior", "klart_vaer", null, undefined, ""]) {
    assert.equal(isStylingPreset(id), false, String(id));
    assert.equal(styleText("nb", id), null, String(id));
  }
  assert.equal(styleText("nb", "styling_dansk_farge"), "Dansk fargemoderne");
  assert.equal(styleText("en", "styling_dansk_farge"), "Danish colour modern");
  for (const id of STYLING_STYLES) {
    assert.equal(styleText("nb", id), t("nb", `styling.style.${styleShort(id)}`), id);
  }
  assert.equal(styleText("nb", "styling_skandinavisk"), "Digital styling – skandinavisk");
  assert.equal(styleText("nb", "styling_ukjent"), null);
});

test("B2: «Detaljer» viser stilen for styling og skumringsanalysen ellers", () => {
  const details = read("components/godkjenning/DetailsPanel.tsx");
  assert.match(details, /const styling = isStylingPreset\(review\.presetId\);/);
  const start = details.indexOf("{styling ? (");
  const split = details.indexOf(") : (", start);
  assert.ok(start > 0 && split > start, "styling-grenen");
  const stylingBranch = details.slice(start, split);
  const rest = details.slice(split);
  assert.match(stylingBranch, /t\(locale, "review\.style"\)/);
  assert.match(stylingBranch, /styleText\(locale, review\.presetId\) \?\? review\.presetId/);
  // Ingen skumringsanalyse for styling: bildetype, himmel, peis og lyskilder.
  assert.doesNotMatch(stylingBranch, /imageType|skyVisibility|review\.sky|fireplace|LightList|review\.lights/);
  for (const key of ["review.analysisTitle", "review.imageType", "review.sky", "review.fireplace", "review.lights", "<LightList"]) {
    assert.ok(rest.includes(key), key);
  }
  // Grunner og merknader staar foer grenen, for alle oppskrifter.
  assert.ok(details.indexOf('"reasonCode"') < start && details.indexOf('"flagCode"') < start);
});

test("B2: ingressen nevner digital styling, ordrett paa nb og en", () => {
  assert.equal(
    DICTIONARIES.nb.ui["express.subtitle"],
    "Kveldsbilde, blå himmel og digital styling laget med AI, og skjuling av ansikter."
  );
  assert.equal(
    DICTIONARIES.en.ui["express.subtitle"],
    "Dusk image, blue sky and digital styling made with AI, and blurring of faces."
  );
  assert.equal(
    DICTIONARIES.nb.ui["home.intro"],
    "Redigering av boligfoto: kveldsbilde, blå himmel og digital styling laget med AI, og skjuling av ansikter."
  );
  assert.equal(
    DICTIONARIES.en.ui["home.intro"],
    "Real estate photo editing: dusk image, blue sky and digital styling made with AI, and blurring of faces."
  );
});
