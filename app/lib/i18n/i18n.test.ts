import { test } from "node:test";
import assert from "node:assert/strict";
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
  assert.equal(codeText("nb", "reviewCode", "fireplace_answer_missing"), "Bildet har peis. Skal den være tent?");
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
