import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./testing/jsxText.ts";

// S2-f: bestilling av Digital styling bak ENABLED.digital_styling (av til S4).
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
  pollJobId,
  stylingParams,
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
      { preset_id: "styling_skandinavisk", job_id: "j1", status: "queued", status_url: "/v1/jobs/j1" },
      { preset_id: "styling_familie", job_id: "j2", status: "queued", status_url: "/v1/jobs/j2" },
      { preset_id: "styling_moderne", job_id: null, status: "not_started", code: "capacity" },
    ],
    quota: { limited: true, used: 1, limit: 3, remaining: 2 },
  },
};

// --- Flagget og kortet ----------------------------------------------------------

test("S2-f: ENABLED.digital_styling er false, og kortet kan ikke bestilles paa start eller Tjenester", () => {
  assert.equal(ENABLED.digital_styling, false);
  assert.equal(isServiceEnabled("digital_styling"), false);
  // Start (snarveiene) og Tjenester bruker orderableTools/expressCategories.
  assert.ok(!orderableTools().some((t) => t.id === "digital_styling"));
  assert.ok(!expressCategories().some((c) => c.id === "furnishing"));
  assert.equal(toolFromParam("digital_styling"), null);
  // Paa Tjenester er kortet «Kommer», som foer (dag 45): synlig, ikke valgbart.
  const card = visibleCategories().flatMap((c) => c.items).find((t) => t.id === "digital_styling");
  assert.ok(card);
  assert.equal(card.orderable, false);
  assert.equal(card.service, "scene_transform");
  assert.equal(card.kind, "styling");
});

// --- Presetene ------------------------------------------------------------------

test("S2-f: de tre stilene har etikett, ventetekst og et filnavn som bare nevner stilen", () => {
  assert.deepEqual([...STYLING_STYLES], ["styling_skandinavisk", "styling_familie", "styling_moderne"]);
  assert.equal(MAX_ORDER_JOBS, STYLING_STYLES.length);
  const slugs = { styling_skandinavisk: "skandinavisk", styling_familie: "familie", styling_moderne: "moderne" };
  for (const preset of STYLING_STYLES) {
    const key = presetLabelKey("scene_transform", preset);
    assert.ok(key, preset);
    assert.equal(DICTIONARIES.nb.ui[key], `Digital styling – ${slugs[preset]}`);
    assert.ok(DICTIONARIES.en.ui[key].startsWith("Virtual staging – "), preset);
    assert.equal(presetWorkingKey("scene_transform", preset), "media.working.styling");
    assert.equal(presetFileSlug(preset), `styling-${slugs[preset]}`);
    assert.equal(downloadFileName("250dccaf-0000", preset), `styling-${slugs[preset]}-ai_250dccaf.jpg`);
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

test("S2-f: velgeren viser sju valg og aldri kids_room eller home_office", () => {
  assert.deepEqual(
    [...FURNISH_AS_CHOICES],
    ["living", "living_dining", "bedroom", "kitchen_dining", "bathroom_decor", "hallway", "balcony_terrace"]
  );
  for (const hidden of ["kids_room", "home_office"]) {
    assert.ok(!(FURNISH_AS_CHOICES as readonly string[]).includes(hidden), hidden);
  }
  const picker = read("components/StylingChoicePicker.tsx");
  assert.match(picker, /FURNISH_AS_CHOICES\.map\(/);
  assert.match(picker, /codeText\(locale, "furnishAs", room\)/);
  assert.doesNotMatch(picker, /kids_room|home_office/);
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

test("S2-f: ingen tekst eller spoersmaal under romvalget (Cowork 21.10), og soverom kan bestilles", () => {
  const picker = read("components/StylingChoicePicker.tsx");
  // Bare tre tekster: overskriften, romvalgene og avkrysningen.
  assert.deepEqual(picker.match(/t\(locale, "[^"]+"\)/g), [
    't(locale, "styling.furnishAs")',
    't(locale, "styling.furnishAs")',
    't(locale, "styling.roomEmpty")',
  ]);
  assert.doesNotMatch(picker, /aria-live|bedroomHint/);
  for (const locale of ["nb", "en"] as const) {
    assert.ok(!Object.keys(DICTIONARIES[locale].ui).some((k) => /bedroomHint|styling\.styles/.test(k)), locale);
  }
  // Soverom sperres ikke: med kryss kan det bestilles.
  assert.notEqual(stylingParams({ furnishAs: "bedroom", roomEmpty: true }), null);
});

// --- Avkrysningen ---------------------------------------------------------------

test("S2-f: «Bestill» er av uten kryss (og uten romtype)", () => {
  assert.equal(t("nb", "styling.roomEmpty"), "Rommet er tomt for løse møbler");
  assert.equal(t("en", "styling.roomEmpty"), "The room is empty of loose furniture");
  assert.equal(t("nb", "styling.order"), "Bestill");
  assert.deepEqual(EMPTY_STYLING, { furnishAs: null, roomEmpty: false });
  assert.equal(stylingParams({ furnishAs: "living", roomEmpty: false }), null);
  assert.equal(stylingParams({ furnishAs: null, roomEmpty: true }), null);
  assert.equal(stylingParams(EMPTY_STYLING), null);
  // Siden: knappen er av naar stylingParams gir null, og et nytt bilde fjerner krysset.
  const page = read("(app)/tjenester/page.tsx");
  assert.match(page, /\(isStyling && stylingParams\(styling\) === null\)/);
  assert.match(page, /<Button onClick=\{handleRun\} disabled=\{runDisabled\}>/);
  assert.match(page, /setStyling\(\(s\) => \(\{ \.\.\.s, roomEmpty: false \}\)\)/);
});

// --- Kallet -----------------------------------------------------------------------

test("S2-f: kallet sender riktig params_json, ett bilde og ingen service", async () => {
  const params = stylingParams({ furnishAs: "living", roomEmpty: true });
  assert.ok(params);
  assert.deepEqual(params, {
    styles: ["styling_skandinavisk", "styling_familie", "styling_moderne"],
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
    styles: ["styling_skandinavisk", "styling_familie", "styling_moderne"],
    furnish_as: "living",
    room_empty_confirmed: true,
  });
});

test("S2-f: én noekkel per bestilling, ogsaa ved dobbeltklikk og nytt forsoek", async () => {
  let n = 0;
  const keys = new OrderKeys(() => `key-${++n}`);
  const file = image();
  const params = stylingParams({ furnishAs: "bedroom", roomEmpty: true })!;
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
  assert.equal(keys.keyFor({ ...order, params: stylingParams({ furnishAs: "living", roomEmpty: true })! }), "key-3");

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
    params: stylingParams({ furnishAs: "hallway", roomEmpty: true })!,
    getToken,
  });
  assert.equal(r.orderId, "ord_1");
  assert.equal(r.duplicate, false);
  assert.deepEqual(r.quota, { limited: true, used: 1, limit: 3, remaining: 2 });
  assert.deepEqual(r.jobs, [
    { presetId: "styling_skandinavisk", jobId: "j1", status: "queued", code: null },
    { presetId: "styling_familie", jobId: "j2", status: "queued", code: null },
    { presetId: "styling_moderne", jobId: null, status: "not_started", code: "capacity" },
  ]);
  assert.deepEqual(r.jobs.map(pollJobId), ["j1", "j2", null]);
  assert.equal(pollJobId(undefined), null);
  // not_started polles aldri, ogsaa om backend skulle sende en id.
  const odd = api.parseStylingOrder({ jobs: [{ preset_id: "styling_moderne", job_id: "x", status: "not_started" }] });
  assert.equal(odd.jobs[0].jobId, null);
  assert.equal(pollJobId(odd.jobs[0]), null);
  // Duplikat: not_started med code null.
  const dup = api.parseStylingOrder({
    order_id: "ord_1",
    duplicate: true,
    jobs: [{ preset_id: "styling_moderne", job_id: null, status: "not_started", code: null }],
    quota: { limited: false },
  });
  assert.equal(dup.duplicate, true);
  assert.deepEqual(dup.quota, { limited: false });
  assert.deepEqual(dup.jobs, [{ presetId: "styling_moderne", jobId: null, status: "not_started", code: null }]);
  // Oedelagt svar krasjer ikke.
  assert.deepEqual(api.parseStylingOrder(null), { orderId: "", duplicate: false, jobs: [], quota: null });
  // Hooken poller med pollJobId: tre faste kall, og null gjoer ingen kall.
  const hook = read("hooks/useOrderJobs.ts");
  for (const i of [0, 1, 2]) assert.match(hook, new RegExp(`useJobStatus\\(pollJobId\\(jobs\\[${i}\\]\\)\\)`));
  const jobStatus = read("lib/useJobStatus.ts");
  assert.match(jobStatus, /if \(!jobId\) \{[^}]*return;\s*\}/);
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
  const params = stylingParams({ furnishAs: "living", roomEmpty: true })!;
  const cases: [number, unknown, string][] = [
    [400, { detail: { code: "room_empty_not_confirmed" } }, "room_empty_not_confirmed"],
    [400, { detail: { code: "invalid_order" } }, "invalid_order"],
    [403, { detail: { code: "service_disabled", rejected: "styling_skandinavisk" } }, "service_disabled"],
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
