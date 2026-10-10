import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// TG-NEW-185: grunnen naar bildet avvises (400 unsupported_image, backend #158).
// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE. fetch mockes; ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { DICTIONARIES, codeText, orderErrorText } = await import("./i18n/index.ts");

const realFetch = globalThis.fetch;
const getToken = async () => "tok";
afterEach(() => {
  globalThis.fetch = realFetch;
});

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const REASONS = ["heic", "clap", "unreadable", "format"];
const LOCALES = ["nb", "en"] as const;

const image = () => new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });

function respond(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

const submit = () =>
  api.submitJob({ service: "scene_transform", image: image(), getToken }).then(
    () => null,
    (e: unknown) => e
  );

test("TG185: 400 unsupported_image er SubmitError med koden, grunnen og status 400", async () => {
  respond(400, { detail: { code: "unsupported_image", reason: "format", format: "bin" } });
  const err = await submit();
  assert.ok(err instanceof api.SubmitError, "skal vaere SubmitError");
  assert.ok(!(err instanceof api.ValidationError), "skal ikke vaere ValidationError");
  assert.equal(err.httpStatus, 400);
  assert.equal(err.code, "unsupported_image");
  assert.equal(err.detail.reason, "format");
});

test("TG185: 400 uten kode er fortsatt ValidationError", async () => {
  respond(400, { detail: "force_scene_type krever exterior" });
  const err = await submit();
  assert.ok(err instanceof api.ValidationError, "skal vaere ValidationError");
  assert.ok(!(err instanceof api.SubmitError), "skal ikke vaere SubmitError");
});

test("TG185: hver grunn har egen tekst paa norsk og engelsk", () => {
  for (const locale of LOCALES) {
    const dict = DICTIONARIES[locale];
    assert.deepEqual(Object.keys(dict.codes.unsupportedImage).sort(), [...REASONS].sort(), locale);
    const texts = REASONS.map((reason) => orderErrorText(locale, "unsupported_image", reason));
    assert.equal(new Set(texts).size, REASONS.length, `${locale}: grunnene skal ha ulike tekster`);
    for (const [i, text] of texts.entries()) {
      const reason = REASONS[i];
      assert.ok(text.trim().length > 0, `${locale}/${reason}`);
      assert.equal(text, dict.codes.unsupportedImage[reason], `${locale}/${reason}`);
      assert.notEqual(text, dict.generic.unsupportedImage, `${locale}/${reason} skal ikke vaere teksten for ukjent grunn`);
      assert.notEqual(text, dict.generic.orderError, `${locale}/${reason} skal ikke vaere den generelle`);
    }
  }
});

test("TG185: ukjent, manglende og rar grunn gir teksten for ukjent grunn, aldri krasj", () => {
  for (const locale of LOCALES) {
    const dict = DICTIONARIES[locale];
    const unknownText = dict.codes.orderError.unsupported_image;
    for (const reason of ["avif", "", null, undefined, 42, {}, "__proto__", "toString", "constructor"]) {
      const text = orderErrorText(locale, "unsupported_image", reason);
      assert.equal(text, unknownText, `${locale}/${String(reason)}`);
      assert.notEqual(text, dict.generic.orderError, `${locale}/${String(reason)}`);
    }
  }
});

test("TG185: teksten for ukjent grunn er lik i orderError og generic", () => {
  for (const locale of LOCALES) {
    const dict = DICTIONARIES[locale];
    assert.equal(dict.codes.orderError.unsupported_image, dict.generic.unsupportedImage, locale);
    assert.equal(codeText(locale, "orderError", "unsupported_image"), dict.generic.unsupportedImage, locale);
  }
});

test("TG185: nb og en er ulike for hver grunn og for ukjent grunn", () => {
  for (const reason of [...REASONS, null]) {
    assert.notEqual(
      orderErrorText("nb", "unsupported_image", reason),
      orderErrorText("en", "unsupported_image", reason),
      String(reason)
    );
  }
});

test("TG185: andre koder gir det samme som orderError, grunnen brukes ikke", () => {
  for (const locale of LOCALES) {
    for (const code of ["free_quota_exhausted", "invalid_idempotency_key", "rate_limited", null, "__proto__"]) {
      assert.equal(orderErrorText(locale, code, "heic"), codeText(locale, "orderError", code), `${locale}/${String(code)}`);
    }
  }
});

test("TG185: Tjenester viser orderErrorText, og hooken tar grunnen fra SubmitError", () => {
  const page = read("(app)/tjenester/page.tsx");
  assert.match(page, /orderErrorText\(locale, job\.errorCode, job\.errorReason\)/);
  assert.doesNotMatch(page, /codeText\(locale, "orderError"/);
  const hook = read("hooks/useProcessJob.ts");
  assert.match(hook, /setSubmitErrorReason\(err\.detail\.reason \?\? null\)/);
  assert.match(hook, /errorReason: submitErrorReason/);
  // Grunnen nullstilles ved ny bestilling og ved «Start paa nytt», som koden.
  assert.equal(hook.match(/setSubmitErrorReason\(null\)/g)?.length, 2);
});
