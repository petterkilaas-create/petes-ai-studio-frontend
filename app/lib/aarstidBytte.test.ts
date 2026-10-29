import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";
import type { JobReviewDetail } from "./api.ts";
import type { ReviewDisclosure } from "./disclosure.ts";

// «Lag i en annen årstid» og «fra … til …» (Dag 58, TG-NEW-273). Kontrakten er
// backend-branchen dag58-aarstid-bytte (4f54532): POST /v1/jobs/{job_id}/aarstid
// (main.py, job_aarstid), ServiceRouter.season_source og source_season i
// merketeksten versjon 10 (disclosure.py). api.ts kaster ved import uten
// NEXT_PUBLIC_API_BASE; fetch byttes ut, ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { DICTIONARIES, aarstidBytteErrorText, orderErrorText } = await import("./i18n/index.ts");
const { disclosureText, DISCLOSURE_DETAIL } = await import("./disclosure.ts");
const { TARGETS_BY_SOURCE, SOURCE_SEASONS } = await import("./aarstid.ts");
const {
  SWITCH_STATUSES,
  SwitchKeys,
  firstStartedJob,
  seasonSwitch,
  switchCost,
  switchExhausted,
  switchSeasons,
  toggleSwitchSeason,
} = await import("./aarstidBytte.ts");

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const raw = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");
const read = (rel: string) => withoutComments(raw(rel));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const getToken = async () => "tok";

interface Seen {
  url: string;
  method: string | undefined;
  headers: Headers;
  body: unknown;
}

/** fetch som svarer med `body` (tekst eller JSON) og husker kallene. */
function scriptFetch(status: number, body: unknown): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method, headers: new Headers(init?.headers), body: init?.body });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return seen;
}

const ACCEPTED = {
  order_id: "ord_b",
  duplicate: false,
  jobs: [
    { preset_id: "aarstid_vinter", job_id: "j9", status: "queued" },
    { preset_id: "aarstid_vaar", job_id: "j10", status: "queued" },
  ],
  quota: { limited: true, used: 2, limit: 3, remaining: 1 },
};

function disclosure(base: string, sourceSeason: string | null, edited: string[] = []): ReviewDisclosure {
  return { version: "10", base, time: null, scope: "exterior", edited, source: null, sourceSeason, status: "ok" };
}

type SwitchReview = Pick<JobReviewDetail, "presetId" | "status" | "isOwner" | "mediaDeletedAt" | "disclosure">;

function review(over: Partial<SwitchReview> = {}): SwitchReview {
  return {
    presetId: "aarstid_hoest",
    status: "succeeded",
    isOwner: true,
    mediaDeletedAt: null,
    disclosure: disclosure("season_autumn", "sommer"),
    ...over,
  };
}

// --- Kallet ---------------------------------------------------------------------

test("Dag 58: POST /v1/jobs/{job_id}/aarstid med bare seasons i JSON, Idempotency-Key og token", async () => {
  const seen = scriptFetch(202, ACCEPTED);
  const r = await api.submitSeasonFromJob({ jobId: "j 1", seasons: ["vaar", "vinter"], idempotencyKey: "k-1", getToken });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "http://api.test/v1/jobs/j%201/aarstid");
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].headers.get("Idempotency-Key"), "k-1");
  assert.equal(seen[0].headers.get("Authorization"), "Bearer tok");
  assert.equal(seen[0].headers.get("Content-Type"), "application/json");
  // Kilden og bildetypen tar backend fra jobben; de gir 400 invalid_order om de sendes.
  assert.deepEqual(JSON.parse(String(seen[0].body)), { seasons: ["vaar", "vinter"] });
  assert.deepEqual(r, {
    orderId: "ord_b",
    duplicate: false,
    jobs: [
      { presetId: "aarstid_vinter", jobId: "j9", status: "queued", code: null },
      { presetId: "aarstid_vaar", jobId: "j10", status: "queued", code: null },
    ],
    quota: { limited: true, used: 2, limit: 3, remaining: 1 },
  });
  // Uten noekkel sendes ingen header.
  const again = scriptFetch(202, ACCEPTED);
  await api.submitSeasonFromJob({ jobId: "j1", seasons: ["vinter"], getToken });
  assert.equal(again[0].headers.get("Idempotency-Key"), null);
});

test("Dag 58: feilene fra kontrakten blir SubmitError med koden; 400 uten kode og 404 blir ikke det", async () => {
  const cases: [number, string][] = [
    [400, "season_already_in_job"],
    [400, "season_target_not_supported"],
    [400, "invalid_order"],
    [402, "free_quota_exhausted"],
    [429, "daily_capacity_reached"],
    [503, "quota_unavailable"],
    [409, "media_deleted"],
    [409, "original_missing"],
    [409, "action_not_allowed"],
  ];
  for (const [status, code] of cases) {
    scriptFetch(status, { detail: { code, used: 3, limit: 3 } });
    await assert.rejects(
      api.submitSeasonFromJob({ jobId: "j1", seasons: ["vinter"], getToken }),
      (err: unknown) => err instanceof api.SubmitError && err.httpStatus === status && err.code === code,
      code,
    );
  }
  // 402 har used/limit, saa kvoten kan settes til tom.
  scriptFetch(402, { detail: { code: "free_quota_exhausted", used: 3, limit: 3 } });
  await assert.rejects(api.submitSeasonFromJob({ jobId: "j1", seasons: ["vinter"], getToken }), (err: unknown) => {
    const e = err as InstanceType<typeof api.SubmitError>;
    return e.detail.used === 3 && e.detail.limit === 3;
  });
  // 404 (tilgang, foer body) har bare tekst i detail.
  scriptFetch(404, { detail: "job not found" });
  await assert.rejects(
    api.submitSeasonFromJob({ jobId: "j1", seasons: ["vinter"], getToken }),
    (err: unknown) => err instanceof Error && !(err instanceof api.SubmitError),
  );
  scriptFetch(400, { detail: "noe annet" });
  await assert.rejects(
    api.submitSeasonFromJob({ jobId: "j1", seasons: ["vinter"], getToken }),
    (err: unknown) => err instanceof api.ValidationError,
  );
});

test("Dag 58: hver kode fra kontrakten har egen tekst på nb og en; 402, 429 og 503 som bestillingen", () => {
  const own = [
    "season_already_in_job",
    "season_target_not_supported",
    "season_source_not_supported",
    "season_source_missing",
    "season_job_required",
    "invalid_order",
    "media_deleted",
    "original_missing",
    "action_not_allowed",
  ];
  for (const locale of ["nb", "en"] as const) {
    const generic = DICTIONARIES[locale].generic.aarstidBytteError;
    for (const code of own) {
      const text = aarstidBytteErrorText(locale, code);
      assert.equal(text, DICTIONARIES[locale].codes.aarstidBytteError[code], `${locale} ${code}`);
      assert.notEqual(text, generic, `${locale} ${code}`);
    }
    for (const code of ["free_quota_exhausted", "daily_capacity_reached", "quota_unavailable", "service_disabled"]) {
      assert.equal(aarstidBytteErrorText(locale, code), orderErrorText(locale, code, null), code);
      assert.notEqual(aarstidBytteErrorText(locale, code), generic, code);
    }
    assert.equal(aarstidBytteErrorText(locale, null), DICTIONARIES[locale].generic.orderError);
  }
  // Teksten for jobbens egen aarstid peker paa den gratis veien.
  assert.match(aarstidBytteErrorText("nb", "season_already_in_job"), /Korriger bildet/);
});

// --- Hvem ser knappen ------------------------------------------------------------

test("Dag 58: knappen for eieren av en årstidsjobb i awaiting_approval og succeeded, med kildens mål", () => {
  assert.deepEqual([...SWITCH_STATUSES].sort(), ["awaiting_approval", "succeeded"]);
  for (const status of SWITCH_STATUSES) {
    assert.deepEqual(seasonSwitch(review({ status })), {
      source: "sommer",
      own: "hoest",
      targets: TARGETS_BY_SOURCE.sommer,
    });
  }
  // Samme tabell som bestillingen, for hver kilde og hvert lovlige maal.
  for (const source of SOURCE_SEASONS) {
    for (const own of TARGETS_BY_SOURCE[source]) {
      const sw = seasonSwitch(review({ presetId: `aarstid_${own}`, disclosure: disclosure("season_autumn", source) }));
      assert.deepEqual(sw, { source, own, targets: TARGETS_BY_SOURCE[source] }, `${source}>${own}`);
    }
  }
});

test("Dag 58: ingen knapp for andre statuser, andres jobb, slettede bilder, andre tjenester eller ukjent kilde", () => {
  for (const status of ["queued", "running", "needs_review", "failed", "rejected", "unknown"]) {
    assert.equal(seasonSwitch(review({ status })), null, status);
  }
  // Backend gir 409 action_not_allowed ogsaa for admin paa en annen brukers jobb.
  assert.equal(seasonSwitch(review({ isOwner: false })), null);
  assert.equal(seasonSwitch(review({ mediaDeletedAt: "2026-10-28T10:00:00Z" })), null);
  for (const presetId of [null, "dusk_v1", "sky_clear", "aarstid_ukjent"]) {
    assert.equal(seasonSwitch(review({ presetId })), null, String(presetId));
  }
  // Uten kilde gir backend 409 season_source_missing; vinter som kilde stoettes ikke.
  assert.equal(seasonSwitch(review({ disclosure: null })), null);
  assert.equal(seasonSwitch(review({ disclosure: disclosure("season_autumn", null) })), null);
  assert.equal(seasonSwitch(review({ disclosure: { ...disclosure("season_autumn", null), sourceSeason: undefined } })), null);
  assert.equal(seasonSwitch(review({ disclosure: disclosure("season_autumn", "vinter") })), null);
});

// --- Valget ------------------------------------------------------------------------

test("Dag 58: jobbens egen årstid kan aldri velges eller sendes; resten sendes i fast rekkefølge", () => {
  const sw = seasonSwitch(review())!;
  assert.deepEqual(toggleSwitchSeason(sw, [], "hoest"), []);
  assert.deepEqual(toggleSwitchSeason(sw, [], "sommer"), []); // kilden er ikke et maal
  let chosen = toggleSwitchSeason(sw, [], "vinter");
  chosen = toggleSwitchSeason(sw, chosen, "vaar");
  assert.deepEqual(chosen, ["vinter", "vaar"]);
  assert.deepEqual(switchSeasons(sw, chosen), ["vaar", "vinter"]);
  assert.deepEqual(toggleSwitchSeason(sw, chosen, "vinter"), ["vaar"]);
  assert.equal(switchSeasons(sw, []), null);
  assert.equal(switchSeasons(sw, ["hoest"]), null);
  assert.equal(switchSeasons(sw, ["vinter", "hoest"]), null);
  assert.equal(switchSeasons(sw, ["sommer"]), null);
});

// --- Kostlinja og kvoten ---------------------------------------------------------------

test("Dag 58: kostlinja «Koster 1 bilde (X igjen)», ingen for admin, grå bare når kvoten er tom", () => {
  assert.deepEqual(switchCost({ limited: true, used: 1, limit: 3, remaining: 2 }), { kind: "counter", remaining: 2 });
  assert.deepEqual(switchCost({ limited: false }), { kind: "none" });
  assert.deepEqual(switchCost(null), { kind: "unknown" });
  assert.equal(switchExhausted({ limited: true, used: 3, limit: 3, remaining: 0 }), true);
  assert.equal(switchExhausted({ limited: true, used: 2, limit: 3, remaining: 1 }), false);
  assert.equal(switchExhausted({ limited: false }), false);
  assert.equal(switchExhausted(null), false);
  assert.equal(DICTIONARIES.nb.ui["aarstidBytte.cost"], "Koster 1 bilde ({remaining} igjen)");
  assert.equal(DICTIONARIES.nb.ui["aarstidBytte.open"], "Lag i en annen årstid");
  assert.equal(DICTIONARIES.nb.ui["aarstidBytte.sameSeason"], "Prøv igjen i samme årstid er gratis (Korriger bildet).");
});

test("Dag 58: etter 202 åpnes første startede jobb; not_started hoppes over", () => {
  assert.equal(firstStartedJob(api.parseStylingOrder(ACCEPTED)), "j9");
  const partly = api.parseStylingOrder({
    ...ACCEPTED,
    jobs: [
      { preset_id: "aarstid_vinter", job_id: "x", status: "not_started", code: "capacity" },
      { preset_id: "aarstid_vaar", job_id: "j10", status: "queued" },
    ],
  });
  assert.equal(firstStartedJob(partly), "j10");
  assert.equal(firstStartedJob({ jobs: [] }), null);
});

test("Dag 58: Idempotency-Key er ny for hvert nytt valg, samme ved nytt forsøk, og ny etter 202", () => {
  let n = 0;
  const keys = new SwitchKeys(() => `k${++n}`);
  assert.equal(keys.keyFor("j1", ["vinter"]), "k1");
  assert.equal(keys.keyFor("j1", ["vinter"]), "k1");
  assert.equal(keys.keyFor("j1", ["vaar", "vinter"]), "k2");
  assert.equal(keys.keyFor("j2", ["vaar", "vinter"]), "k3");
  keys.accepted();
  assert.equal(keys.keyFor("j2", ["vaar", "vinter"]), "k4");
});

// --- Merketeksten «fra … til …» -----------------------------------------------------------

test("Dag 58: annonseteksten sier «fra <kilde> til <mål>» for alle åtte parene, på nb og en", () => {
  const BASE: Record<string, string> = { hoest: "season_autumn", vaar: "season_spring", sommer: "season_summer", vinter: "season_winter" };
  const NB: Record<string, string> = { sommer: "sommer", hoest: "høst", vaar: "vår", vinter: "vinter" };
  const EN: Record<string, string> = { sommer: "summer", hoest: "autumn", vaar: "spring", vinter: "winter" };
  let pairs = 0;
  for (const source of SOURCE_SEASONS) {
    for (const target of TARGETS_BY_SOURCE[source]) {
      pairs += 1;
      const d = disclosure(BASE[target], source, ["snow_added", "light_adapted"]);
      assert.deepEqual(disclosureText("nb", d, DISCLOSURE_DETAIL), {
        kind: "text",
        text: `Bildet er redigert med AI: årstiden er endret fra ${NB[source]} til ${NB[target]}. Snø er lagt til, og lys og skygger er tilpasset årstiden.`,
      });
      assert.deepEqual(disclosureText("en", d, "base"), {
        kind: "text",
        text: `The image has been edited with AI: the season has been changed from ${EN[source]} to ${EN[target]}.`,
      });
    }
  }
  assert.equal(pairs, 8);
});

test("Dag 58: uten source_season er teksten som i dag; ukjent kilde gir ingen tekst", () => {
  assert.deepEqual(disclosureText("nb", disclosure("season_winter", null), "edited"), {
    kind: "text",
    text: "Bildet er redigert med AI: årstiden er endret til vinter.",
  });
  // Feltet mangler (versjon 9 og eldre): som null.
  const v9: ReviewDisclosure = disclosure("season_winter", null);
  delete v9.sourceSeason;
  assert.deepEqual(disclosureText("nb", v9, "edited"), {
    kind: "text",
    text: "Bildet er redigert med AI: årstiden er endret til vinter.",
  });
  assert.deepEqual(disclosureText("nb", disclosure("season_winter", "vinter"), "edited"), { kind: "missing" });
  assert.deepEqual(disclosureText("nb", disclosure("season_winter", "Sommer"), "edited"), { kind: "missing" });
  // Andre baser faar aldri kilden, og teksten deres endres ikke.
  assert.deepEqual(disclosureText("nb", disclosure("sky_replaced", "sommer", ["sky"]), "edited"), {
    kind: "text",
    text: "Bildet er redigert med AI: himmelen er byttet til klar himmel. Himmel er redigert.",
  });
});

test("Dag 58: normalizeReview leser disclosure.source_season", () => {
  const body = { disclosure: { version: "10", base: "season_autumn", edited: [], source: null, source_season: "sommer", status: "ok" } };
  assert.equal(api.normalizeReview(body, "j1").disclosure?.sourceSeason, "sommer");
  assert.equal(api.normalizeReview({ disclosure: { ...body.disclosure, source_season: null } }, "j1").disclosure?.sourceSeason, null);
  assert.equal(api.normalizeReview({ disclosure: { ...body.disclosure, source_season: 3 } }, "j1").disclosure?.sourceSeason, null);
});

// --- Siden og komponenten (kildekoden som tekst) ---------------------------------------------

test("Dag 58: siden viser panelet bare med seasonSwitch, og panelet sender, trekker kvoten og går videre", () => {
  const page = read("components/godkjenning/ResultReview.tsx");
  assert.match(page, /const sw = seasonSwitch\(review\);/);
  assert.match(page, /\{sw !== null && \(\s*<SeasonSwitchPanel/);
  assert.match(page, /const quota = useQuota\(\);/);

  const panel = read("components/godkjenning/SeasonSwitchPanel.tsx");
  assert.match(panel, /submitSeasonFromJob\(\{ jobId, seasons, idempotencyKey, getToken \}\)/);
  assert.match(panel, /router\.push\(`\/godkjenning\/\$\{encodeURIComponent\(next\)\}`\)/);
  assert.match(panel, /onQuota\(\{ kind: "exhausted", \.\.\.err\.detail \}\)/);
  assert.match(panel, /onQuota\(\{ kind: "accepted", quota: result\.quota \}\)/);
  // Grå, ikke skjult: knappen er disabled med tom kvote, og kostlinja staar.
  assert.match(panel, /disabled=\{exhausted\}/);
  assert.match(panel, /cost\.kind === "none" \? null/);
  // Jobbens egen aarstid er grået ut og forklart.
  assert.match(panel, /disabled=\{own \|\| busy\}/);
  assert.match(panel, /aria-describedby=\{own \? sameId : undefined\}/);
  assert.match(panel, /"aarstidBytte\.sameSeason"/);
  // Ingen tekst skrevet rett inn.
  assert.deepEqual(literalTextsInFile(raw("components/godkjenning/SeasonSwitchPanel.tsx")), []);
});
