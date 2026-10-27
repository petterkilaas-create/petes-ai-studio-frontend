import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./testing/jsxText.ts";
import type { JobSummary, ReviewOrder } from "./api.ts";
import type { ReviewDisclosure } from "./disclosure.ts";

// Aarstider (TG-NEW-271, Dag 57). Kontrakten er backend-branchen dag57-aarstid-be:
// POST /v1/orders/aarstid (main.py), SEASONS, SOURCE_SEASONS og TEXT_BY_PAIR
// (prompt_modules_aarstid.py) og basene og kodene i merketeksten (disclosure.py,
// versjon 9). api.ts kaster ved import uten NEXT_PUBLIC_API_BASE; fetch byttes
// ut, ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { OrderKeys } = await import("./orderKey.ts");
const { DICTIONARIES, aarstidOrderErrorText, orderErrorText, t } = await import("./i18n/index.ts");
const { ENABLED, orderableTools, toolFromParam, visibleCategories } = await import("./services.ts");
const { SERVICE_CARD_TEXT } = await import("./serviceCards.ts");
const { presetFileSlug, presetLabelKey, presetWorkingKey } = await import("./presets.ts");
const { imageTypeChoices } = await import("./imageType.ts");
const { orderTabs } = await import("./orderTabs.ts");
const { orderLines, orderTitle } = await import("./historyGroups.ts");
const { CHECKLISTS, checklistFor } = await import("./checklist.ts");
const { correctionControls } = await import("./correction.ts");
const { clauseSentence, disclosureText, DISCLOSURE_DETAIL } = await import("./disclosure.ts");
const { STYLING_ORDER_SERVICE } = await import("./styling.ts");
const {
  AARSTID_ORDER_SERVICE,
  AARSTID_PRESETS,
  EMPTY_AARSTID,
  MAX_SEASONS,
  SEASONS,
  SOURCE_SEASONS,
  TARGETS_BY_SOURCE,
  aarstidParams,
  aarstidSummary,
  chooseSource,
  isAarstidPreset,
  seasonOfPreset,
  seasonText,
  targetsFor,
  toggleSeason,
} = await import("./aarstid.ts");

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

// Backend TEXT_BY_PAIR (dag57-aarstid-be, prompt_modules_aarstid.py): (kilde, maal) -> tekstnavn.
const TEXT_BY_PAIR: Record<string, string> = {
  "sommer>hoest": "AARSTID_S_HOEST",
  "sommer>vaar": "AARSTID_S_VAAR",
  "sommer>vinter": "AARSTID_S_SNOE",
  "vaar>hoest": "AARSTID_S_HOEST",
  "vaar>vinter": "AARSTID_S_SNOE",
  "hoest>sommer": "AARSTID_H_SOMMER",
  "hoest>vaar": "AARSTID_H_VAAR",
  "hoest>vinter": "AARSTID_H_SNOE",
};

// Backend RULES_SEASON: kodene per tekstnavn, i fast rekkefoelge.
const CODES_BY_TEXT: Record<string, string[]> = {
  AARSTID_S_HOEST: ["leaves_recoloured", "fallen_leaves_added", "light_adapted"],
  AARSTID_S_VAAR: ["leaves_recoloured", "light_adapted"],
  AARSTID_S_SNOE: ["snow_added", "light_adapted"],
  AARSTID_H_SOMMER: ["leaves_recoloured", "leaves_added", "light_adapted"],
  AARSTID_H_VAAR: ["leaves_recoloured", "leaves_added", "light_adapted"],
  AARSTID_H_SNOE: ["snow_added", "light_adapted"],
};

// Backend BASE_BY_PRESET for aarstidene: maalaarstiden gir basen.
const BASE_BY_TARGET: Record<string, string> = {
  hoest: "season_autumn",
  vaar: "season_spring",
  sommer: "season_summer",
  vinter: "season_winter",
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const getToken = async () => "tok";
const image = () => new File([new Uint8Array([1, 2, 3])], "hus.jpg", { type: "image/jpeg" });

interface Seen {
  url: string;
  headers: Headers;
  form: FormData;
}

/** fetch som svarer i rekkefoelge og husker kallene. */
function scriptFetch(responses: { status: number; body: unknown }[]): Seen[] {
  const seen: Seen[] = [];
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), headers: new Headers(init?.headers), form: init?.body as FormData });
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return seen;
}

const ACCEPTED = {
  status: 202,
  body: {
    order_id: "ord_a",
    duplicate: false,
    jobs: [
      { preset_id: "aarstid_hoest", job_id: "j1", status: "queued" },
      { preset_id: "aarstid_vinter", job_id: "j2", status: "queued" },
    ],
    quota: { limited: true, used: 1, limit: 3, remaining: 2 },
  },
};

function disclosure(base: string, edited: string[], status = "ok"): ReviewDisclosure {
  return { version: "9", base, time: null, scope: "exterior", edited, source: null, status };
}

// --- Kildevalget styrer maalene ------------------------------------------------

test("Dag 57: maalene per kilde er nøyaktig parene i backend (TEXT_BY_PAIR), aldri samme som kilden", () => {
  assert.deepEqual([...SEASONS], ["hoest", "vaar", "sommer", "vinter"]);
  const fromBackend: Record<string, string[]> = {};
  for (const pair of Object.keys(TEXT_BY_PAIR)) {
    const [source, target] = pair.split(">");
    (fromBackend[source] ??= []).push(target);
  }
  for (const source of SOURCE_SEASONS) {
    // Samme rekkefoelge som SEASONS, som allowed_targets i backend.
    const expected = SEASONS.filter((s) => fromBackend[source].includes(s));
    assert.deepEqual([...TARGETS_BY_SOURCE[source]], expected, source);
    assert.ok(!TARGETS_BY_SOURCE[source].includes(source), `${source} er aldri et maal for seg selv`);
  }
  assert.deepEqual(Object.keys(TARGETS_BY_SOURCE).sort(), Object.keys(fromBackend).sort());
  // vaar til sommer finnes ikke i foerste versjon.
  assert.deepEqual([...targetsFor("vaar")], ["hoest", "vinter"]);
  assert.deepEqual([...targetsFor(null)], []);
});

test("Dag 57: vinter som kilde vises ikke og sendes aldri; knappene er Sommer, Høst, Vår", () => {
  assert.deepEqual([...SOURCE_SEASONS], ["sommer", "hoest", "vaar"]);
  assert.ok(!(SOURCE_SEASONS as readonly string[]).includes("vinter"));
  const vinter = { source: "vinter", seasons: ["hoest"] } as unknown as Parameters<typeof aarstidParams>[0];
  assert.equal(aarstidParams(vinter), null);
  assert.deepEqual(SOURCE_SEASONS.map((s) => t("nb", `aarstid.season.${s}`)), ["Sommer", "Høst", "Vår"]);
  // Velgeren bygger kildeknappene av SOURCE_SEASONS og maalene av targetsFor, aldri av SEASONS direkte.
  const picker = read("components/AarstidChoicePicker.tsx");
  assert.match(picker, /SOURCE_SEASONS\.map\(\(source\) =>/);
  assert.match(picker, /const targets = targetsFor\(value\.source\);/);
  assert.match(picker, /targets\.map\(\(season\) =>/);
  assert.doesNotMatch(picker, /(^|[^_A-Z])SEASONS\.map/m);
});

test("Dag 57: ny kilde tar bort maal som ikke lenger er lovlige, og beholder resten", () => {
  let choice = chooseSource(EMPTY_AARSTID, "sommer");
  choice = toggleSeason(choice, "hoest");
  choice = toggleSeason(choice, "vaar");
  assert.deepEqual(choice, { source: "sommer", seasons: ["hoest", "vaar"] });
  // Hoest som kilde: hoest er ikke lov lenger, vaar staar.
  assert.deepEqual(chooseSource(choice, "hoest"), { source: "hoest", seasons: ["vaar"] });
  // Vaar som kilde: vaar er ikke lov, hoest staar.
  assert.deepEqual(chooseSource(choice, "vaar"), { source: "vaar", seasons: ["hoest"] });
  // Et maal som ikke er lovlig for kilden, legges aldri til.
  assert.deepEqual(toggleSeason({ source: "vaar", seasons: [] }, "sommer").seasons, []);
  assert.deepEqual(toggleSeason({ source: "sommer", seasons: [] }, "sommer").seasons, []);
  assert.deepEqual(toggleSeason(EMPTY_AARSTID, "hoest").seasons, []);
});

// --- 1–3 ---------------------------------------------------------------------

test("Dag 57: én til tre aarstider; den fjerde legges ikke til, og en valgt kan alltid tas bort", () => {
  assert.equal(MAX_SEASONS, 3);
  let choice = chooseSource(EMPTY_AARSTID, "sommer");
  for (const s of ["vinter", "hoest", "vaar"] as const) choice = toggleSeason(choice, s);
  assert.deepEqual(choice.seasons, ["vinter", "hoest", "vaar"]);
  // Kilden hoest har ogsaa tre maal; med tre valgt er det fullt.
  const full = { source: "hoest" as const, seasons: ["vaar", "sommer", "vinter"] as ("hoest" | "vaar" | "sommer" | "vinter")[] };
  assert.deepEqual(toggleSeason(full, "vaar").seasons, ["sommer", "vinter"]);
  // Paramene: ingen, eller flere enn tre, gir null; ingenting kuttes stille.
  assert.equal(aarstidParams({ source: "sommer", seasons: [] }), null);
  assert.equal(aarstidParams(EMPTY_AARSTID), null);
  assert.equal(aarstidParams({ source: null, seasons: ["hoest"] }), null);
  const four = { source: "sommer", seasons: ["hoest", "vaar", "vinter", "sommer"] } as unknown as Parameters<typeof aarstidParams>[0];
  assert.equal(aarstidParams(four), null);
  // Et ulovlig par gir null (backend ville gitt season_target_not_supported).
  assert.equal(aarstidParams({ source: "vaar", seasons: ["sommer"] }), null);
  assert.equal(aarstidParams({ source: "sommer", seasons: ["sommer"] }), null);
  // Velgeren: med tre valgt er resten aria-disabled og kan ikke velges.
  const picker = read("components/AarstidChoicePicker.tsx");
  assert.match(picker, /const atLimit = value\.seasons\.length >= MAX_SEASONS;/);
  assert.match(picker, /if \(!on && atLimit\) return;/);
  assert.match(picker, /aria-pressed=\{on\}/);
  assert.match(picker, /aria-disabled=\{locked \|\| undefined\}/);
});

test("Dag 57: bestillingslinja sier hva som mangler, og «Bestill» er av uten komplett valg", () => {
  assert.deepEqual(aarstidSummary("nb", EMPTY_AARSTID), {
    text: "Ingen årstid valgt · Tidspunkt ikke valgt",
    short: "Ingen årstid valgt · Tidspunkt ikke valgt",
    missing: "Velg når bildet er tatt.",
  });
  assert.equal(aarstidSummary("nb", { source: "sommer", seasons: [] }).missing, "Velg minst én årstid.");
  assert.deepEqual(aarstidSummary("nb", { source: "sommer", seasons: ["hoest", "vinter"] }), {
    text: "2 årstider · Tatt om sommeren",
    short: "2 årstider · Tatt om sommeren",
    missing: null,
  });
  assert.equal(aarstidSummary("en", { source: "hoest", seasons: ["vaar"] }).text, "1 season · Taken in autumn");
  // Siden: knappen er av naar aarstidParams gir null, og et nytt bilde nullstiller valget (kilden gjelder bildet).
  const page = read("(app)/tjenester/page.tsx");
  assert.match(page, /\(isAarstid && aarstidParams\(aarstid\) === null\)/);
  assert.match(page, /\{isAarstid && \(\s*<StylingOrderBar \{\.\.\.aarstidSummary\(locale, aarstid\)\}>\s*<Button onClick=\{handleRun\} disabled=\{runDisabled\}>/);
  const fileChange = page.slice(page.indexOf("const handleFileChange"), page.indexOf("const handleSceneTypeChange"));
  assert.match(fileChange, /setAarstid\(EMPTY_AARSTID\);/);
  const select = page.slice(page.indexOf("const selectTool"), page.indexOf("const handleFileChange"));
  assert.match(select, /setAarstid\(EMPTY_AARSTID\);/);
});

// --- Body til ruten -------------------------------------------------------------

test("Dag 57: kallet går til /v1/orders/aarstid med params_json, ett bilde og ingen service", async () => {
  const params = aarstidParams({ source: "sommer", seasons: ["vinter", "hoest"] });
  // Fast rekkefoelge (SEASONS), og bildetypen er alltid «Utendørs».
  assert.deepEqual(params, { seasons: ["hoest", "vinter"], source_season: "sommer", image_type_hint: "exterior" });
  const seen = scriptFetch([ACCEPTED]);
  const r = await api.submitAarstidOrder({ image: image(), params: params!, idempotencyKey: "k-a", getToken });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "http://api.test/v1/orders/aarstid");
  assert.equal(seen[0].headers.get("Idempotency-Key"), "k-a");
  assert.equal(seen[0].headers.get("Authorization"), "Bearer tok");
  assert.deepEqual([...seen[0].form.keys()].sort(), ["image", "params_json"]);
  assert.equal(seen[0].form.getAll("image").length, 1);
  assert.deepEqual(JSON.parse(String(seen[0].form.get("params_json"))), {
    seasons: ["hoest", "vinter"],
    source_season: "sommer",
    image_type_hint: "exterior",
  });
  // Samme 202-svar som styling: én jobb per aarstid.
  assert.equal(r.orderId, "ord_a");
  assert.deepEqual(r.jobs.map((j) => [j.presetId, j.jobId]), [["aarstid_hoest", "j1"], ["aarstid_vinter", "j2"]]);
  assert.deepEqual(r.quota, { limited: true, used: 1, limit: 3, remaining: 2 });
});

test("Dag 57: styling-kallet er uendret, og noekkelen skiller en aarstid-bestilling fra styling", async () => {
  const seen = scriptFetch([ACCEPTED]);
  await api.submitStylingOrder({
    image: image(),
    params: { styles: ["styling_japandi"], furnish_as: "living", room_empty_confirmed: true },
    getToken,
  });
  assert.equal(seen[0].url, "http://api.test/v1/orders/styling");
  assert.notEqual(AARSTID_ORDER_SERVICE, STYLING_ORDER_SERVICE);
  let n = 0;
  const keys = new OrderKeys(() => `key-${++n}`);
  const file = image();
  const params = aarstidParams({ source: "hoest", seasons: ["sommer"] });
  const a = keys.keyFor({ file, service: AARSTID_ORDER_SERVICE, params });
  assert.equal(keys.keyFor({ file, service: AARSTID_ORDER_SERVICE, params }), a, "nytt forsoek: samme noekkel");
  assert.notEqual(keys.keyFor({ file, service: STYLING_ORDER_SERVICE, params }), a);
  // Hooken: runAarstid bruker submitAarstidOrder og AARSTID_ORDER_SERVICE, siden kaller runAarstid.
  const hook = read("hooks/useOrderJobs.ts");
  assert.match(hook, /place\(file, AARSTID_ORDER_SERVICE, params, submitAarstidOrder\)/);
  const page = read("(app)/tjenester/page.tsx");
  assert.match(page, /if \(selectedTool\.kind === "aarstid"\) \{\s*const params = aarstidParams\(aarstid\);\s*if \(params !== null\) void order\.runAarstid\(preview\.file, params\);/);
});

// --- Feiltekstene ---------------------------------------------------------------

test("Dag 57: feilkodene fra bestillingen kastes med koden og har tekst på nb og en", async () => {
  const params = aarstidParams({ source: "sommer", seasons: ["hoest"] })!;
  const cases: [number, unknown, string][] = [
    [400, { detail: { code: "invalid_order" } }, "invalid_order"],
    [400, { detail: { code: "season_source_not_supported", source_season: "vinter" } }, "season_source_not_supported"],
    [
      400,
      { detail: { code: "season_target_not_supported", source_season: "vaar", season: "sommer", allowed: ["hoest", "vinter"] } },
      "season_target_not_supported",
    ],
    [403, { detail: { code: "service_disabled", rejected: "aarstid_hoest" } }, "service_disabled"],
  ];
  for (const [status, body, code] of cases) {
    scriptFetch([{ status, body }]);
    await assert.rejects(
      api.submitAarstidOrder({ image: image(), params, getToken }),
      (err: unknown) => err instanceof api.SubmitError && err.httpStatus === status && err.code === code,
      code
    );
  }
  const expected: Record<string, [string, string]> = {
    invalid_order: [
      "Bestillingen er ikke gyldig. Velg når bildet er tatt og én til tre årstider.",
      "The order is not valid. Choose when the photo was taken and one to three seasons.",
    ],
    season_source_not_supported: [
      "Bilder tatt om vinteren kan ikke brukes ennå. Velg sommer, høst eller vår.",
      "Photos taken in winter cannot be used yet. Choose summer, autumn or spring.",
    ],
    season_target_not_supported: [
      "En av årstidene kan ikke lages fra et bilde tatt på denne tiden av året. Velg årstidene på nytt.",
      "One of the seasons cannot be made from a photo taken at this time of year. Choose the seasons again.",
    ],
  };
  for (const [code, [nb, en]] of Object.entries(expected)) {
    assert.equal(aarstidOrderErrorText("nb", code, null), nb, code);
    assert.equal(aarstidOrderErrorText("en", code, null), en, code);
  }
  // Andre koder: som orderErrorText. Stylingteksten for invalid_order er uendret.
  for (const code of ["free_quota_exhausted", "service_disabled", "duplicate_request", "unsupported_image", null, "ukjent"]) {
    assert.equal(aarstidOrderErrorText("nb", code, "heic"), orderErrorText("nb", code, "heic"), String(code));
  }
  assert.equal(orderErrorText("nb", "invalid_order", null), "Bestillingen er ikke gyldig. Velg rom og én til tre stiler.");
  assert.equal(aarstidOrderErrorText("nb", "__proto__", null), orderErrorText("nb", "__proto__", null));
  // Siden bruker aarstidsteksten bare for aarstider.
  const page = read("(app)/tjenester/page.tsx");
  assert.match(page, /\(isAarstid \? aarstidOrderErrorText : orderErrorText\)\(locale, order\.errorCode, order\.errorReason\)/);
});

// --- Kortet --------------------------------------------------------------------

test("Dag 57: kortet «Årstider» er på, etter Blå himmel, med egen bestilling og uten bildetypevelgeren", () => {
  assert.equal(ENABLED.aarstider, true);
  const timetraveler = visibleCategories().find((c) => c.id === "timetraveler")!;
  assert.deepEqual(timetraveler.items.map((t) => t.id), ["skumring", "klart_vaer", "aarstider"]);
  const tool = orderableTools().find((t) => t.id === "aarstider")!;
  assert.equal(tool.kind, "aarstid");
  assert.equal(tool.service, "scene_transform");
  assert.equal(tool.presetId, undefined);
  // «Utendørs» staar i velgeren; ImageTypeChoice (med «La analysen avgjøre») vises ikke.
  assert.deepEqual(imageTypeChoices(tool), []);
  assert.deepEqual(toolFromParam("aarstider"), { categoryId: "timetraveler", toolId: "aarstider" });
  assert.equal(t("nb", tool.titleKey), "Årstider");
  assert.equal(t("nb", tool.descKey), "Samme bilde i en annen årstid: høst, vår, sommer eller vinter.");
  assert.equal(t("en", tool.titleKey), "Seasons");
  assert.deepEqual(
    [...SERVICE_CARD_TEXT.aarstider.chips, SERVICE_CARD_TEXT.aarstider.cta].map((k) => t("nb", k)),
    ["Du velger årstidene", "Bilder tatt utendørs", "Velg årstider"]
  );
  const icons = read("components/toolIcons.ts");
  assert.match(icons, /aarstider: Leaf,/);
});

test("Dag 57: kortbildene er før/etter-paret fra s1, og etter-bildet er det merkede vinterbildet", () => {
  const images = read("(app)/tjenester/cardImages.ts");
  assert.match(images, /import seasonBefore from "\.\/bilder\/aarstid-for\.jpg";/);
  assert.match(images, /import seasonAfter from "\.\/bilder\/aarstid-etter\.jpg";/);
  assert.match(images, /aarstider: \{ before: seasonBefore, after: seasonAfter \},/);
  const sha = (name: string) =>
    createHash("sha256").update(readFileSync(join(APP_DIR, "(app)/tjenester/bilder", name))).digest("hex");
  assert.equal(sha("aarstid-for.jpg"), "a8d3e4f53e6ab1a99924002dc5ad317906f16b4a69f9e8a13c4ef340bad3ec95");
  assert.equal(sha("aarstid-etter.jpg"), "6c69403f3aebae6b0eb17f071612617f499ebc6d5e2c92b66430c0cc63ac1449");
});

test("Dag 57: velgeren har bildetypen «Utendørs» med forklaring og teksten under valget", () => {
  assert.equal(t("nb", "aarstid.source"), "Når er bildet tatt?");
  assert.equal(t("nb", "aarstid.seasons"), "Hvilke årstider vil du se?");
  assert.equal(t("nb", "imageTypeChoice.exterior"), "Utendørs");
  assert.equal(t("nb", "aarstid.imageTypeHelp"), "Fasade, hage og balkong støttes.");
  assert.equal(t("nb", "aarstid.orderNote"), "Én bestilling, ett gratisbilde. Hver årstid blir et eget bilde.");
  assert.equal(t("en", "aarstid.orderNote"), "One order, one free image. Each season becomes a separate image.");
  assert.deepEqual(SEASONS.map((s) => t("nb", `aarstid.season.${s}`)), ["Høst", "Vår", "Sommer", "Vinter"]);
  const picker = read("components/AarstidChoicePicker.tsx");
  assert.match(picker, /aria-pressed="true"/);
  assert.match(picker, /t\(locale, "imageTypeChoice\.exterior"\)/);
  assert.match(picker, /t\(locale, "aarstid\.orderNote"\)/);
  const page = read("(app)/tjenester/page.tsx");
  assert.match(page, /\{isAarstid && \(\s*<AarstidChoicePicker value=\{aarstid\} onChange=\{setAarstid\} disabled=\{isProcessing\} locale=\{locale\} \/>/);
});

// --- Fanene og historikken -----------------------------------------------------

test("Dag 57: én fane per aarstid med aarstidens navn, ikke «Digital styling»", () => {
  const order: ReviewOrder = {
    orderId: "ord_a",
    jobs: [
      { jobId: "j1", presetId: "aarstid_hoest", status: "awaiting_approval", thumbUrl: null, code: null },
      { jobId: "j2", presetId: "aarstid_vaar", status: "running", thumbUrl: null, code: null },
      { jobId: "j3", presetId: "aarstid_vinter", status: "succeeded", thumbUrl: null, code: null },
    ],
  };
  const tabs = orderTabs(order, "j2", "nb")!;
  assert.deepEqual(tabs.map((tab) => tab.label), ["Høst", "Vår", "Vinter"]);
  assert.deepEqual(tabs.map((tab) => tab.current), [false, true, false]);
  assert.deepEqual(orderTabs(order, "j1", "en")!.map((tab) => tab.label), ["Autumn", "Spring", "Winter"]);
  assert.ok(!tabs.some((tab) => tab.label === "Digital styling"));
  // Stilene er uendret.
  const styling: ReviewOrder = {
    orderId: "o",
    jobs: [
      { jobId: "s1", presetId: "styling_japandi", status: "queued", thumbUrl: null, code: null },
      { jobId: "s2", presetId: "ukjent", status: "queued", thumbUrl: null, code: null },
    ],
  };
  assert.deepEqual(orderTabs(styling, "s1", "nb")!.map((tab) => tab.label), ["Japandi", "Digital styling"]);
});

function summary(jobId: string, presetId: string | null): JobSummary {
  return {
    jobId,
    service: "scene_transform",
    status: "awaiting_approval",
    createdAt: "2026-10-27T08:00:00Z",
    thumbUrl: null,
    originalThumbUrl: null,
    error: null,
    code: null,
    reason: null,
    isOwner: true,
    ownerShort: null,
    presetId,
    orderId: "ord_a",
  } as JobSummary;
}

test("Dag 57: historikken heter «Årstider · N bilder», med én linje per aarstid", () => {
  const jobs = [summary("j1", "aarstid_hoest"), summary("j2", "aarstid_vinter")];
  assert.equal(orderTitle("nb", jobs), "Årstider · 2 bilder");
  assert.equal(orderTitle("en", jobs), "Seasons · 2 images");
  assert.equal(orderTitle("nb", jobs.slice(0, 1)), "Årstider · 1 bilde");
  assert.equal(orderTitle("nb", [...jobs, summary("j3", "aarstid_vaar")]), "Årstider · 3 bilder");
  assert.deepEqual(orderLines("nb", jobs).map((l) => l.label), ["Høst", "Vinter"]);
  // Styling er uendret, og en blandet liste (skal ikke finnes) heter ikke «Årstider».
  const styling = [summary("s1", "styling_japandi"), summary("s2", "styling_funkis")];
  assert.equal(orderTitle("nb", styling), "Digital styling · 2 stiler");
  assert.equal(orderTitle("nb", [summary("j1", "aarstid_hoest"), summary("s1", "styling_japandi")]), "Digital styling · 2 stiler");
});

test("Dag 57: etikett, ventetekst og filnavn per aarstid; prefikset og forhaandsvalgene", () => {
  assert.deepEqual(AARSTID_PRESETS, {
    hoest: "aarstid_hoest",
    vaar: "aarstid_vaar",
    sommer: "aarstid_sommer",
    vinter: "aarstid_vinter",
  });
  for (const season of SEASONS) {
    const id: string = AARSTID_PRESETS[season];
    assert.ok(isAarstidPreset(id), id);
    assert.equal(seasonOfPreset(id), season);
    assert.equal(presetWorkingKey("scene_transform", id), "media.working.aarstid");
    assert.equal(presetFileSlug(id), `aarstid-${season}`);
  }
  assert.equal(t("nb", presetLabelKey("scene_transform", "aarstid_hoest")!), "Årstider – høst");
  assert.equal(t("en", presetLabelKey("scene_transform", "aarstid_vinter")!), "Seasons – winter");
  assert.equal(t("nb", "media.working.aarstid"), "Endrer årstiden …");
  for (const id of ["styling_japandi", "skumring", "aarstid", "aarstid_ukjent", null, undefined]) {
    assert.equal(seasonText("nb", id), null, String(id));
  }
  assert.equal(isAarstidPreset("skumring"), false);
});

test("Dag 57: sjekklista for aarstider på godkjenningssiden", () => {
  assert.equal(checklistFor("aarstid_vaar"), "aarstider");
  assert.deepEqual(CHECKLISTS.aarstider.map((key) => t("nb", key)), [
    "Bygning: vegger, vinduer, dører og tak som i originalen.",
    "Ingen nye trær, busker eller ting, og ingenting fjernet.",
    "Eviggrønne trær er grønne.",
    "Løv på bakken: bare på gress og vei, ikke på terrassen, trappa eller balkongen.",
  ]);
});

test("Dag 57: «Korriger bildet» bare når backend sier det (allowed_actions), ingen egen regel for aarstider", () => {
  const correction = { roundsUsed: 0, roundsLeft: 2, maxRounds: 2, currentRound: 0, currentOverrides: null, lastRoundFailed: false };
  const base = { correction, reviewPanels: ["correct"] } as unknown as Parameters<typeof correctionControls>[0];
  assert.equal(correctionControls({ ...base, allowedActions: ["approve", "reject"] }).show, false);
  assert.equal(correctionControls({ ...base, allowedActions: ["approve", "reject", "correct"] }).show, true);
  // Ingen kode leser aarstid-prefikset for rettingen.
  for (const rel of ["lib/correction.ts", "lib/review.ts"]) {
    assert.doesNotMatch(read(rel), /aarstid/i, rel);
  }
});

// --- Merketeksten -------------------------------------------------------------

test("Dag 57: merketeksten for alle åtte parene, uten kilden (Petter 27.10, 1 A)", () => {
  const nb: Record<string, string> = {
    "sommer>hoest":
      "Bildet er redigert med AI: årstiden er endret til høst. Fargene på løvet er endret, løv er lagt på bakken, og lys og skygger er tilpasset årstiden.",
    "vaar>hoest":
      "Bildet er redigert med AI: årstiden er endret til høst. Fargene på løvet er endret, løv er lagt på bakken, og lys og skygger er tilpasset årstiden.",
    "sommer>vaar":
      "Bildet er redigert med AI: årstiden er endret til vår. Fargene på løvet er endret, og lys og skygger er tilpasset årstiden.",
    "sommer>vinter":
      "Bildet er redigert med AI: årstiden er endret til vinter. Snø er lagt til, og lys og skygger er tilpasset årstiden.",
    "vaar>vinter":
      "Bildet er redigert med AI: årstiden er endret til vinter. Snø er lagt til, og lys og skygger er tilpasset årstiden.",
    "hoest>sommer":
      "Bildet er redigert med AI: årstiden er endret til sommer. Fargene på løvet er endret, løv er lagt til på trær og busker, og lys og skygger er tilpasset årstiden.",
    "hoest>vaar":
      "Bildet er redigert med AI: årstiden er endret til vår. Fargene på løvet er endret, løv er lagt til på trær og busker, og lys og skygger er tilpasset årstiden.",
    "hoest>vinter":
      "Bildet er redigert med AI: årstiden er endret til vinter. Snø er lagt til, og lys og skygger er tilpasset årstiden.",
  };
  assert.deepEqual(Object.keys(nb).sort(), Object.keys(TEXT_BY_PAIR).sort());
  for (const [pair, text] of Object.entries(TEXT_BY_PAIR)) {
    const target = pair.split(">")[1];
    const d = disclosure(BASE_BY_TARGET[target], CODES_BY_TEXT[text]);
    assert.deepEqual(disclosureText("nb", d, DISCLOSURE_DETAIL), { kind: "text", text: nb[pair] }, pair);
    // Uten tidspunkt i teksten, ogsaa med "full".
    assert.deepEqual(disclosureText("nb", d, "full"), { kind: "text", text: nb[pair] }, `${pair} full`);
  }
  assert.deepEqual(disclosureText("en", disclosure("season_autumn", CODES_BY_TEXT.AARSTID_S_HOEST), "edited"), {
    kind: "text",
    text:
      "The image has been edited with AI: the season has been changed to autumn. The colours of the leaves have been changed, leaves have been added to the ground, and light and shadows have been adapted to the season.",
  });
});

test("Dag 57: hver base og hver kode har tekst på nb og en, og ukjent eller feil kode gir ingen tekst", () => {
  const bases: Record<string, [string, string]> = {
    season_autumn: ["høst", "autumn"],
    season_spring: ["vår", "spring"],
    season_summer: ["sommer", "summer"],
    season_winter: ["vinter", "winter"],
  };
  for (const [base, [nb, en]] of Object.entries(bases)) {
    assert.deepEqual(disclosureText("nb", disclosure(base, []), "edited"), {
      kind: "text",
      text: `Bildet er redigert med AI: årstiden er endret til ${nb}.`,
    });
    assert.deepEqual(disclosureText("en", disclosure(base, []), "edited"), {
      kind: "text",
      text: `The image has been edited with AI: the season has been changed to ${en}.`,
    });
  }
  const codes: Record<string, [string, string]> = {
    leaves_recoloured: ["Fargene på løvet er endret.", "The colours of the leaves have been changed."],
    leaves_added: ["Løv er lagt til på trær og busker.", "Leaves have been added to trees and shrubs."],
    fallen_leaves_added: ["Løv er lagt på bakken.", "Leaves have been added to the ground."],
    snow_added: ["Snø er lagt til.", "Snow has been added."],
    light_adapted: ["Lys og skygger er tilpasset årstiden.", "Light and shadows have been adapted to the season."],
  };
  for (const [code, [nb, en]] of Object.entries(codes)) {
    const nbText = disclosureText("nb", disclosure("season_summer", [code]), "edited");
    assert.deepEqual(nbText, { kind: "text", text: `Bildet er redigert med AI: årstiden er endret til sommer. ${nb}` }, code);
    const enText = disclosureText("en", disclosure("season_summer", [code]), "edited");
    assert.deepEqual(enText, { kind: "text", text: `The image has been edited with AI: the season has been changed to summer. ${en}` }, code);
  }
  // Grunnsetningen alene med "base".
  assert.deepEqual(disclosureText("nb", disclosure("season_winter", ["snow_added", "light_adapted"]), "base"), {
    kind: "text",
    text: "Bildet er redigert med AI: årstiden er endret til vinter.",
  });
  // Strengt: ukjent kode, en kode fra kveldsbildet, duplikater og unverified gir ingen tekst.
  const missing = { kind: "missing" };
  assert.deepEqual(disclosureText("nb", disclosure("season_autumn", ["leaves_recoloured", "sky"]), "edited"), missing);
  assert.deepEqual(disclosureText("nb", disclosure("season_autumn", ["ukjent"]), "edited"), missing);
  assert.deepEqual(disclosureText("nb", disclosure("season_autumn", ["light_adapted", "light_adapted"]), "edited"), missing);
  assert.deepEqual(disclosureText("nb", disclosure("season_autumn", ["light_adapted"], "unverified"), "edited"), missing);
  assert.deepEqual(disclosureText("nb", disclosure("season_fall", ["light_adapted"]), "edited"), missing);
  // Og motsatt: en aarstidskode under kveldsbildet gir heller ingen tekst.
  assert.deepEqual(
    disclosureText("nb", { ...disclosure("evening_from_day", ["snow_added"]), time: "early" }, "edited"),
    missing
  );
  // De gamle basene er uendret.
  assert.deepEqual(disclosureText("nb", disclosure("sky_replaced", ["sky"]), "edited"), {
    kind: "text",
    text: "Bildet er redigert med AI: himmelen er byttet til klar himmel. Himmel er redigert.",
  });
  // Komma foran «og»/«and» mellom leddene.
  assert.equal(clauseSentence("nb", ["a", "b"]), "A, og b.");
  assert.equal(clauseSentence("en", ["a", "b", "c"]), "A, b, and c.");
  assert.equal(clauseSentence("nb", ["a"]), "A.");
  // Tabellene har de samme kodene paa nb og en.
  assert.deepEqual(
    Object.keys(DICTIONARIES.nb.codes.disclosureSeasonEdited),
    Object.keys(DICTIONARIES.en.codes.disclosureSeasonEdited)
  );
});
