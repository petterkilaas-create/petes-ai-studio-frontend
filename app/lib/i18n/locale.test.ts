import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cookieLocale,
  headerLanguages,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  localeCookie,
  parseLocale,
  resolveLocale,
} from "./locale.ts";

test("TG-129: parseLocale godtar bare nb og en", () => {
  assert.equal(parseLocale("nb"), "nb");
  assert.equal(parseLocale("en"), "en");
  for (const v of ["NB", "no", "nn", "de", "en-US", "", " nb", "__proto__", "toString", undefined, null, 1, {}]) {
    assert.equal(parseLocale(v), null, String(v));
  }
});

test("TG-129: headerLanguages sorterer etter q og hopper over * og q=0", () => {
  assert.deepEqual(headerLanguages("nb-NO,nb;q=0.9,en;q=0.8"), ["nb-NO", "nb", "en"]);
  assert.deepEqual(headerLanguages("en;q=0.5, nb"), ["nb", "en"]);
  assert.deepEqual(headerLanguages("da;q=0.8,sv;q=0.8"), ["da", "sv"], "stabil ved likt");
  assert.deepEqual(headerLanguages("*;q=0.1,nb;q=0"), []);
  assert.deepEqual(headerLanguages("en;q=abc"), []);
  assert.deepEqual(headerLanguages(""), []);
  assert.deepEqual(headerLanguages(null), []);
  assert.deepEqual(headerLanguages(undefined), []);
});

test("TG-129: Accept-Language gir samme regel som pickLocale (bare foerstevalget)", () => {
  for (const h of ["nb-NO,nb;q=0.9,en;q=0.8", "no", "nn-NO", "en;q=0.1,nb"]) {
    assert.equal(resolveLocale({ acceptLanguage: h }), "nb", h);
  }
  for (const h of ["en-US,en;q=0.9", "sv-SE,nb;q=0.9", "da", "", null]) {
    assert.equal(resolveLocale({ acceptLanguage: h }), "en", String(h));
  }
  assert.equal(resolveLocale({}), "en");
});

test("TG-129: Clerk foran cookien foran nettleseren, og ugyldige verdier hoppes over", () => {
  assert.equal(resolveLocale({ saved: "en", cookie: "nb", acceptLanguage: "nb" }), "en");
  assert.equal(resolveLocale({ cookie: "en", acceptLanguage: "nb" }), "en");
  assert.equal(resolveLocale({ cookie: "nb", acceptLanguage: "en-US" }), "nb");
  assert.equal(resolveLocale({ saved: "de", cookie: "en", acceptLanguage: "nb" }), "en");
  assert.equal(resolveLocale({ saved: "xx", cookie: "yy", acceptLanguage: "nb-NO" }), "nb");
});

test("TG-129: cookien har Path, ett aar, SameSite=Lax, og Secure bare paa https", () => {
  assert.equal(LOCALE_COOKIE, "pas_locale");
  assert.equal(LOCALE_COOKIE_MAX_AGE, 31536000);
  assert.equal(localeCookie("en", true), "pas_locale=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  assert.equal(localeCookie("nb", false), "pas_locale=nb; Path=/; Max-Age=31536000; SameSite=Lax");
});

test("TG-129: cookieLocale leser og validerer cookien fra document.cookie", () => {
  assert.equal(cookieLocale("a=1; pas_locale=en; b=2"), "en");
  assert.equal(cookieLocale("pas_locale=nb"), "nb");
  assert.equal(cookieLocale("pas_locale=de"), null);
  assert.equal(cookieLocale("xpas_locale=en"), null);
  assert.equal(cookieLocale(""), null);
  assert.equal(cookieLocale(null), null);
});
