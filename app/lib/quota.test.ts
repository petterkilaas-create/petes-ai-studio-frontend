import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// TG-NEW-149 (KONTRAKT_KVOTE): telleren, kvotekodene og Idempotency-Key.
// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE. fetch mockes; ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { applyQuotaEvent, canOrder, countsAgainstQuota, parseQuota, quotaView } = await import("./quota.ts");
const { OrderKeys } = await import("./orderKey.ts");
const { DICTIONARIES, codeText, t } = await import("./i18n/index.ts");

const realFetch = globalThis.fetch;
const getToken = async () => "tok";
afterEach(() => {
  globalThis.fetch = realFetch;
});

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const ORDER_CODES = [
  "free_quota_exhausted",
  "daily_capacity_reached",
  "quota_unavailable",
  "job_create_failed",
  "duplicate_request",
  "invalid_idempotency_key",
];

const image = () => new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });

/** Svarer med `responses` i tur og orden og husker headerne i hvert kall. */
function scriptFetch(responses: { status: number; body: unknown; headers?: Record<string, string> }[]) {
  const seen: Headers[] = [];
  let i = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen.push(new Headers(init?.headers));
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json", ...r.headers },
    });
  }) as typeof fetch;
  return seen;
}

const accepted = (jobId: string, quota: unknown, extra: Record<string, unknown> = {}) => ({
  status: 202,
  body: { job_id: jobId, service: "scene_transform", status: "queued", status_url: `/v1/jobs/${jobId}`, quota, ...extra },
});

// --- Telleren ---------------------------------------------------------------

test("TG149: telleren viser remaining av limit fra svaret, ogsaa for en pilot", () => {
  assert.deepEqual(quotaView(parseQuota({ limited: true, used: 1, limit: 3, remaining: 2 })), {
    kind: "counter",
    remaining: 2,
    limit: 3,
  });
  assert.deepEqual(quotaView(parseQuota({ limited: true, used: 2, limit: 7, remaining: 5 })), {
    kind: "counter",
    remaining: 5,
    limit: 7,
  });
  assert.equal(t("nb", "quota.counter", { remaining: 5, limit: 7 }), "5 av 7 gratis bilder igjen");
  assert.equal(t("en", "quota.counter", { remaining: 5, limit: 7 }), "5 of 7 free images left");
});

test("TG149: ingen teller naar limited er false, ved 503 eller ved ugyldig form", () => {
  assert.deepEqual(quotaView(parseQuota({ limited: false })), { kind: "hidden" });
  assert.deepEqual(quotaView(null), { kind: "hidden" });
  for (const raw of [null, {}, "x", { limited: true }, { limited: true, used: 1, limit: "3", remaining: 2 }]) {
    assert.equal(parseQuota(raw), null, JSON.stringify(raw));
  }
});

test("TG149: telleren gjelder bare skumring (scene_transform), aldri privacy_blur", () => {
  assert.equal(countsAgainstQuota("scene_transform"), true);
  assert.equal(countsAgainstQuota("privacy_blur"), false);
  assert.equal(countsAgainstQuota(undefined), false);
});

// --- Brukt opp ----------------------------------------------------------------

test("TG149: remaining = 0 stenger bestilling av kveldsbilde og viser meldingen", () => {
  const quota = parseQuota({ limited: true, used: 3, limit: 3, remaining: 0 });
  assert.deepEqual(quotaView(quota), { kind: "exhausted", limit: 3 });
  assert.equal(canOrder("scene_transform", quota), false);
  // Skjul ansikter og skilt trekker ikke og er aldri stengt.
  assert.equal(canOrder("privacy_blur", quota), true);
  assert.equal(canOrder("scene_transform", parseQuota({ limited: false })), true);
  assert.equal(canOrder("scene_transform", null), true);
  assert.equal(
    t("nb", "quota.exhausted", { limit: 3 }),
    "Du har brukt de 3 gratis bildene dine. Du kan ikke bestille flere kveldsbilder nå."
  );
});

test("TG149: 402 er SubmitError med koden, aldri en generell feil, og stenger bestillingen", async () => {
  scriptFetch([{ status: 402, body: { detail: { code: "free_quota_exhausted", used: 3, limit: 3 } } }]);
  const err = await api
    .submitJob({ service: "scene_transform", image: image(), getToken })
    .then(() => null, (e: unknown) => e);
  assert.ok(err instanceof api.SubmitError, "402 skal vaere SubmitError");
  assert.equal(err.httpStatus, 402);
  assert.equal(err.code, "free_quota_exhausted");

  // Slik useProcessJob melder 402 til useQuota.
  const before = parseQuota({ limited: true, used: 2, limit: 3, remaining: 1 });
  const after = applyQuotaEvent(before, { kind: "exhausted", ...err.detail });
  assert.deepEqual(quotaView(after), { kind: "exhausted", limit: 3 });
  assert.equal(canOrder("scene_transform", after), false);
  // Ukjent kvote foer 402 (GET /v1/quota feilet): tallet kommer fra svaret.
  assert.deepEqual(quotaView(applyQuotaEvent(null, { kind: "exhausted", ...err.detail })), { kind: "exhausted", limit: 3 });
  assert.equal(codeText("nb", "orderError", err.code), DICTIONARIES.nb.codes.orderError.free_quota_exhausted);
});

test("TG149: hver kvotekode fra bestillingen blir SubmitError med koden", async () => {
  const cases: [number, string][] = [
    [429, "daily_capacity_reached"],
    [503, "quota_unavailable"],
    [503, "job_create_failed"],
    [409, "duplicate_request"],
    [400, "invalid_idempotency_key"],
  ];
  for (const [status, code] of cases) {
    scriptFetch([{ status, body: { detail: { code } } }]);
    const err = await api
      .submitJob({ service: "scene_transform", image: image(), getToken })
      .then(() => null, (e: unknown) => e);
    assert.ok(err instanceof api.SubmitError, code);
    assert.equal(err.code, code);
    assert.equal(err.httpStatus, status);
  }
  // Uendret: 400 uten kode er fortsatt ValidationError, 503 uten kode en vanlig feil.
  scriptFetch([{ status: 400, body: { detail: "force_scene_type krever exterior" } }]);
  await assert.rejects(api.submitJob({ service: "scene_transform", image: image(), getToken }), api.ValidationError);
  scriptFetch([{ status: 503, body: { detail: "lite minne" } }]);
  await assert.rejects(
    api.submitJob({ service: "scene_transform", image: image(), getToken }),
    (e: unknown) => e instanceof Error && !(e instanceof api.SubmitError) && /503/.test(e.message)
  );
});

test("TG149: 202 oppdaterer telleren; uten quota (privacy_blur) staar tallet", async () => {
  scriptFetch([accepted("j1", { limited: true, used: 2, limit: 3, remaining: 1 })]);
  const r = await api.submitJob({ service: "scene_transform", image: image(), getToken });
  assert.equal(r.kind, "async");
  if (r.kind !== "async") return;
  const before = parseQuota({ limited: true, used: 1, limit: 3, remaining: 2 });
  assert.deepEqual(quotaView(applyQuotaEvent(before, { kind: "accepted", quota: r.quota })), {
    kind: "counter",
    remaining: 1,
    limit: 3,
  });
  assert.equal(applyQuotaEvent(before, { kind: "accepted", quota: null }), before);
});

// --- Tekstene -----------------------------------------------------------------

test("TG149: hver kode har egen tekst paa norsk og engelsk; ukjent kode gir den generelle", () => {
  for (const locale of ["nb", "en"] as const) {
    const dict = DICTIONARIES[locale];
    assert.deepEqual(Object.keys(dict.codes.orderError).sort(), [...ORDER_CODES].sort(), locale);
    for (const code of ORDER_CODES) {
      const text = codeText(locale, "orderError", code);
      assert.ok(text.trim().length > 0, `${locale}/${code}`);
      assert.notEqual(text, dict.generic.orderError, `${locale}/${code} skal ha egen tekst`);
    }
    for (const code of ["rate_limited", "", null, undefined, "__proto__"]) {
      assert.equal(codeText(locale, "orderError", code), dict.generic.orderError, `${locale}/${String(code)}`);
    }
    // Den generelle er den samme som for en teknisk feil foer TG-NEW-149.
    assert.equal(dict.generic.orderError, t(locale, "job.failed"));
  }
  assert.notEqual(codeText("nb", "orderError", "quota_unavailable"), codeText("en", "orderError", "quota_unavailable"));
});

test("TG149: antallet gratisbilder er ikke skrevet inn i ordlista, komponenten eller siden", () => {
  for (const locale of ["nb", "en"] as const) {
    const dict = DICTIONARIES[locale];
    const texts = [dict.ui["quota.counter"], dict.ui["quota.exhausted"], ...Object.values(dict.codes.orderError)];
    for (const text of texts) assert.doesNotMatch(text, /\d/, `${locale}: ${text}`);
    assert.match(dict.ui["quota.counter"], /\{remaining\}/);
    assert.match(dict.ui["quota.counter"], /\{limit\}/);
    assert.match(dict.ui["quota.exhausted"], /\{limit\}/);
  }
  for (const rel of ["components/QuotaNotice.tsx", "lib/quota.ts", "hooks/useQuota.ts"]) {
    assert.doesNotMatch(read(rel), /\b3\b/, rel);
  }
  const page = read("(app)/express/page.tsx");
  assert.doesNotMatch(page, /\b(limit|remaining|used)\s*[:=]\s*\d/);
  assert.doesNotMatch(page, /\b(av|of) \d+ (gratis|free)/);
  assert.match(page, /<QuotaNotice view=\{quotaShown\}/);
  assert.match(page, /codeText\(locale, "orderError", job\.errorCode\)/);
});

// --- Idempotency-Key ------------------------------------------------------------

test("TG149: samme bestilling sender samme Idempotency-Key ved nytt forsoek, en ny bestilling en ny", async () => {
  let n = 0;
  const keys = new OrderKeys(() => `key-${++n}`);
  const file = image();
  const params = { preset_id: "skumring", dusk_time: "early", dusk_sky: "clear" };
  const order = async () => {
    const idempotencyKey = keys.keyFor({ file, service: "scene_transform", params: { ...params } });
    try {
      await api.submitJob({ service: "scene_transform", image: file, params: params as never, idempotencyKey, getToken });
      keys.accepted();
    } catch {
      // Ikke mottatt: neste klikk er et nytt forsoek av samme bestilling.
    }
  };

  // 503 quota_unavailable -> nytt forsoek -> 202 -> ny bestilling.
  const seen = scriptFetch([
    { status: 503, body: { detail: { code: "quota_unavailable" } } },
    accepted("j1", { limited: true, used: 1, limit: 3, remaining: 2 }),
    accepted("j2", { limited: true, used: 2, limit: 3, remaining: 1 }),
  ]);
  await order();
  await order();
  await order();
  const sent = seen.map((h) => h.get("Idempotency-Key"));
  assert.deepEqual(sent, ["key-1", "key-1", "key-2"]);
  assert.ok(seen.every((h) => h.get("Authorization") === "Bearer tok"));
});

test("TG149: endret bilde, tjeneste eller valg, og «Start paa nytt», gir ny noekkel", () => {
  let n = 0;
  const keys = new OrderKeys(() => `k${++n}`);
  const file = image();
  const p = { preset_id: "skumring", dusk_time: "early" };
  assert.equal(keys.keyFor({ file, service: "scene_transform", params: p }), "k1");
  assert.equal(keys.keyFor({ file, service: "scene_transform", params: { ...p } }), "k1");
  assert.equal(keys.keyFor({ file, service: "scene_transform", params: { ...p, dusk_time: "late" } }), "k2");
  assert.equal(keys.keyFor({ file: image(), service: "scene_transform", params: { ...p, dusk_time: "late" } }), "k3");
  const f = image();
  assert.equal(keys.keyFor({ file: f, service: "privacy_blur" }), "k4");
  keys.clear();
  assert.equal(keys.keyFor({ file: f, service: "privacy_blur" }), "k5");
  keys.accepted();
  assert.equal(keys.keyFor({ file: f, service: "privacy_blur" }), "k6");
  // Standard: en uuid.
  assert.match(new OrderKeys().keyFor({ file: f, service: "x" }), /^[0-9a-f-]{36}$/);
});

test("TG149: uten noekkel sendes ingen Idempotency-Key-header", async () => {
  const seen = scriptFetch([accepted("j1", { limited: false })]);
  await api.submitJob({ service: "scene_transform", image: image(), getToken });
  assert.equal(seen[0].has("Idempotency-Key"), false);
});

test("TG149: duplicate: true foelges som en vanlig jobb (samme job_id, created_at null)", async () => {
  scriptFetch([
    accepted("j-same", { limited: true, used: 1, limit: 3, remaining: 2 }, { duplicate: true, created_at: null }),
  ]);
  const r = await api.submitJob({ service: "scene_transform", image: image(), idempotencyKey: "k", getToken });
  assert.equal(r.kind, "async");
  if (r.kind !== "async") return;
  assert.equal(r.jobId, "j-same");
  assert.equal(r.duplicate, true);
  // Hooken skiller ikke paa duplicate: jobId foelges som for en ny jobb.
  const hook = read("hooks/useProcessJob.ts");
  assert.doesNotMatch(hook, /\.duplicate\b/);
  assert.match(hook, /setJobId\(result\.jobId\)/);
});

// --- GET /v1/quota --------------------------------------------------------------

test("TG149: getQuota leser megler og admin; 503 og nettverksfeil gir null", async () => {
  scriptFetch([{ status: 200, body: { limited: true, used: 0, limit: 3, remaining: 3 } }]);
  assert.deepEqual(await api.getQuota({ getToken }), { limited: true, used: 0, limit: 3, remaining: 3 });
  scriptFetch([{ status: 200, body: { limited: false } }]);
  assert.deepEqual(await api.getQuota({ getToken }), { limited: false });
  scriptFetch([{ status: 503, body: { detail: { code: "quota_unavailable" } } }]);
  assert.equal(await api.getQuota({ getToken }), null);
  globalThis.fetch = (async () => {
    throw new TypeError("network");
  }) as typeof fetch;
  assert.equal(await api.getQuota({ getToken }), null);
});
