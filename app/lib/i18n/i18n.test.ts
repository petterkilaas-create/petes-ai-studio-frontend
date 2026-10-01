import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeText, DICTIONARIES, pickLocale, t, type CodeGroup } from "./index.ts";

test("pickLocale: nb, no og nn gir norsk, alt annet engelsk", () => {
  for (const langs of [["nb"], ["nb-NO"], ["no"], ["nn-NO", "en"], ["NB_no"]]) {
    assert.equal(pickLocale(langs), "nb", langs.join(","));
  }
  for (const langs of [["en-US"], ["sv-SE", "nb"], ["da"], [], undefined, null]) {
    assert.equal(pickLocale(langs), "en", String(langs));
  }
});

test("kodene fra audit 2d §8 har norsk tekst", () => {
  assert.equal(codeText("nb", "reviewCode", "fireplace_answer_missing"), "Venter på svar om peisen.");
  assert.equal(codeText("nb", "reviewCode", "gate_review"), "Bildet må sjekkes før vi lager det.");
  assert.equal(codeText("nb", "reasonCode", "analysis_uncertain"), "Analysen var usikker.");
  assert.equal(
    codeText("nb", "reasonCode", "image_type_disagreement"),
    "Analysen var uenig om hva slags bilde dette er."
  );
  assert.equal(codeText("nb", "reasonCode", "valid_runs_insufficient"), "Analysen ga ufullstendig svar.");
  assert.equal(codeText("nb", "reasonCode", "image_type_untested"), "Denne bildetypen støttes ikke ennå.");
  assert.equal(t("nb", "status.rejectedByYou"), "Avvist av deg");
  assert.equal(t("en", "status.rejectedByYou"), "Rejected by you");
});

test("ukjent, tom og rar kode gir generisk tekst, aldri krasj", () => {
  const groups = Object.keys(DICTIONARIES.nb.codes) as CodeGroup[];
  for (const locale of ["nb", "en"] as const) {
    for (const group of groups) {
      for (const code of ["brand_new_code", "", null, undefined, 42, "__proto__", "toString", "constructor"]) {
        assert.equal(codeText(locale, group, code), DICTIONARIES[locale].generic[group], `${locale}/${group}/${String(code)}`);
      }
    }
  }
});

test("nb og en har de samme noeklene og kodene", () => {
  const { nb, en } = DICTIONARIES;
  assert.deepEqual(Object.keys(en.ui).sort(), Object.keys(nb.ui).sort());
  assert.deepEqual(Object.keys(en.codes).sort(), Object.keys(nb.codes).sort());
  for (const group of Object.keys(nb.codes) as CodeGroup[]) {
    assert.deepEqual(Object.keys(en.codes[group]).sort(), Object.keys(nb.codes[group]).sort(), group);
  }
  for (const text of [...Object.values(nb.ui), ...Object.values(en.ui)]) {
    assert.ok(text.trim().length > 0);
  }
});

test("t setter inn verdier og lar ukjente plassholdere staa", () => {
  assert.equal(t("nb", "action.reasonCount", { n: 3, max: 500 }), "3 av 500 tegn");
  assert.equal(t("en", "action.reasonCount", { n: 3 }), "3 of {max} characters");
});

test("peistekstene er ulike, og spoersmaalet staar bare i kontrollen (avvik 11)", () => {
  for (const locale of ["nb", "en"] as const) {
    const missing = codeText(locale, "reviewCode", "fireplace_answer_missing");
    const present = codeText(locale, "reasonCode", "fireplace_present");
    const question = t(locale, "action.fireplaceQuestion");
    assert.notEqual(missing, present, locale);
    for (const text of [missing, present]) {
      assert.notEqual(text, question, locale);
      assert.ok(!text.includes("?"), `${locale}: ${text}`);
    }
  }
  assert.equal(codeText("nb", "reasonCode", "fireplace_present"), "Analysen fant peis.");
  assert.equal(codeText("en", "reviewCode", "fireplace_answer_missing"), "Waiting for an answer about the fireplace.");
  assert.equal(codeText("en", "reasonCode", "fireplace_present"), "The analysis found a fireplace.");
});

test("peisknappene heter Tent/Ikke tent, med linja om slukking (2d-2d)", () => {
  assert.equal(t("nb", "action.fireplaceLit"), "Tent");
  assert.equal(t("nb", "action.fireplaceNotLit"), "Ikke tent");
  assert.equal(t("en", "action.fireplaceLit"), "Lit");
  assert.equal(t("en", "action.fireplaceNotLit"), "Not lit");
  assert.equal(
    t("nb", "action.fireplaceNotLitHint"),
    "Velger du «Ikke tent», slukkes ilden hvis den brenner i originalen."
  );
  assert.equal(
    t("en", "action.fireplaceNotLitHint"),
    'If you choose "Not lit", a fire burning in the original will be put out.'
  );
});

test("Rett-tekstene fra prompten (2d-2b)", () => {
  assert.equal(
    t("nb", "correct.confirmExists"),
    "Jeg bekrefter at lyskildene jeg har slått på, finnes i originalbildet."
  );
  assert.equal(t("nb", "correct.roundsLeft", { n: 1 }), "Runder igjen: 1");
  assert.equal(
    t("nb", "correct.roundFailed"),
    "Det nye bildet kunne ikke lages. Du har fortsatt forrige bilde, og runden er ikke brukt."
  );
  assert.equal(codeText("nb", "decisionError", "correction_limit"), "Du har brukt rundene dine.");
  assert.equal(t("nb", "review.lightPromoted"), "Slått på av deg");
  assert.equal(t("nb", "review.lightDisabled"), "Slått av av deg");
});

test("merketeksten: nb og en har noeklene og alle kodene fra kontrakten", () => {
  const keys = [
    "review.disclosureTitle",
    "review.disclosureHelp",
    "review.disclosureMissing",
    "action.copy",
    "review.copied",
    "review.copyFailed",
  ] as const;
  const edited = [
    "sky",
    "window_lights",
    "neighbour_window_lights",
    "exterior_lamps",
    "interior_lamps",
    "candles",
    "fireplace_fire",
  ];
  for (const locale of ["nb", "en"] as const) {
    const dict = DICTIONARIES[locale];
    for (const key of keys) assert.ok(dict.ui[key].trim().length > 0, `${locale} ${key}`);
    assert.deepEqual(Object.keys(dict.codes.disclosureBase), ["evening_from_day"]);
    assert.deepEqual(Object.keys(dict.codes.disclosureTime).sort(), ["early", "late"]);
    assert.deepEqual(Object.keys(dict.codes.disclosureEdited), edited);
  }
  assert.equal(t("nb", "review.disclosureHelp"), "Lim den inn i annonsen sammen med bildet.");
  assert.equal(t("nb", "review.copyFailed"), "Kunne ikke kopiere. Marker teksten og kopier den selv.");
});

test("nedlastingen (merking PR 4): nb og en har noeklene", () => {
  const keys = [
    "review.download",
    "review.downloading",
    "review.downloadFailed",
    "review.downloadNotAllowed",
    "review.downloadBroken",
    "history.open",
  ] as const;
  for (const locale of ["nb", "en"] as const) {
    for (const key of keys) assert.ok(DICTIONARIES[locale].ui[key].trim().length > 0, `${locale} ${key}`);
  }
  assert.equal(t("nb", "review.download"), "Last ned merket bilde");
  assert.equal(t("nb", "review.downloadBroken"), "Bildet kunne ikke hentes. Kontakt oss.");
});

test("«Rett» heter «Korriger bildet» (Lekkasjen L4)", () => {
  assert.equal(t("nb", "action.correct"), "Korriger bildet");
  assert.equal(t("en", "action.correct"), "Correct image");
  assert.equal(t("nb", "correct.title"), "Korriger lyskildene");
  assert.equal(t("en", "correct.title"), "Correct the light sources");
  const { nb, en } = DICTIONARIES;
  assert.deepEqual(Object.keys(en.ui).sort(), Object.keys(nb.ui).sort());
  // Ingen tekst (ui eller koder) er bare «Rett»/«Correct», og siden har
  // ingen slik tekst skrevet rett inn.
  for (const dict of [nb, en]) {
    const texts = [
      ...Object.values(dict.ui),
      ...Object.values(dict.codes).flatMap((group) => Object.values(group)),
    ];
    for (const text of texts) assert.doesNotMatch(String(text).trim(), /^(Rett|Correct)$/);
  }
  // D2b: knappen ligger i handlingskortet; siden og kortet har ingen «Rett» skrevet rett inn.
  const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const page = readFileSync(join(app, "godkjenning", "[jobId]", "page.tsx"), "utf8");
  const card = readFileSync(join(app, "components", "godkjenning", "DecisionCard.tsx"), "utf8");
  for (const src of [page, card]) assert.doesNotMatch(src, />\s*Rett\s*</);
  assert.match(card, /t\(locale, "action\.correct"\)/);
});
