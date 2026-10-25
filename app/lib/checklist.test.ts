import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AdditionsLevel } from "./api.ts";
import { CHECKLISTS, checklistFor, comparedKey, type ChecklistId } from "./checklist.ts";
import { DICTIONARIES, t, type Locale } from "./i18n/index.ts";

// D-5a (Petter 25.10): sjekklista per tjeneste (AVVIK 2 a) og ett kryss
// (§3 b). Tekstene i ordlista er generert fra sjekklister_v1.json; testene
// sammenligner med en byte-lik kopi, saa ingen tekst kan gli fra kilden.

const BYTES = readFileSync(new URL("./testdata/sjekklister_v1.json", import.meta.url));
const SHA256 = "615a5b634a301b513c2d093be73fe6b58bfc6ba499ec8776076106efc4343ca8";

interface Source {
  versjon: string;
  tittel: Record<Locale, string>;
  kryss: { nb: string; en: string; nb_advarsel: string; en_advarsel: string };
  lister: Record<ChecklistId, Record<Locale, string>[]>;
}
const SOURCE = JSON.parse(BYTES.toString("utf8")) as Source;
const LOCALES: Locale[] = ["nb", "en"];

test("D-5a: kopien av sjekklister_v1.json er byte-lik kilden", () => {
  assert.equal(createHash("sha256").update(BYTES).digest("hex"), SHA256);
  assert.equal(SOURCE.versjon, "sjekklister_v1");
});

test("D-5a: tittelen og krysset i ordlista er teksten i JSON-en", () => {
  for (const locale of LOCALES) {
    assert.equal(t(locale, "checklist.title"), SOURCE.tittel[locale], locale);
    assert.equal(t(locale, "checklist.compared"), SOURCE.kryss[locale], locale);
    assert.equal(t(locale, "checklist.comparedWarning"), SOURCE.kryss[`${locale}_advarsel`], locale);
  }
});

test("D-5a: de tre listene har punktene fra JSON-en, i samme rekkefølge, på nb og en", () => {
  assert.deepEqual(Object.keys(CHECKLISTS).sort(), Object.keys(SOURCE.lister).sort());
  for (const id of Object.keys(SOURCE.lister) as ChecklistId[]) {
    assert.equal(CHECKLISTS[id].length, SOURCE.lister[id].length, id);
    for (const locale of LOCALES) {
      assert.deepEqual(
        CHECKLISTS[id].map((key) => t(locale, key)),
        SOURCE.lister[id].map((item) => item[locale]),
        `${id} ${locale}`
      );
    }
  }
});

test("D-5a: ordlista har ingen andre checklist-nøkler enn listene, tittelen og krysset", () => {
  const expected = ["checklist.title", "checklist.compared", "checklist.comparedWarning", ...Object.values(CHECKLISTS).flat()].sort();
  for (const locale of LOCALES) {
    const keys = Object.keys(DICTIONARIES[locale].ui).filter((k) => k.startsWith("checklist.")).sort();
    assert.deepEqual(keys, expected, locale);
  }
});

test("D-5a: lista velges ut fra oppskriften, som ellers på siden", () => {
  // Styling: alle stilene, ogsaa nye med samme prefiks (stilene v3).
  for (const id of ["styling_skandinavisk", "styling_moderne_nordisk", "styling_japandi", "styling_funkis"]) {
    assert.equal(checklistFor(id), "styling", id);
  }
  // Kveldsbilde: begge skumringsoppskriftene, og reserven uten preset_id (eldre jobber).
  for (const id of ["skumring", "skumring_interior", null, undefined]) {
    assert.equal(checklistFor(id), "kveldsbilde", String(id));
  }
  // Klart vaer («Blå himmel»).
  assert.equal(checklistFor("klart_vaer"), "blaa_himmel");
  // Ukjent tjeneste: ingen liste, bare krysset.
  for (const id of ["magic_cleanup", "virtual_stage", "styling", "", "Skumring", "__proto__"]) {
    assert.equal(checklistFor(id), null, id);
  }
});

test("D-5a: krysset har advarselsteksten bare ved advarsel", () => {
  assert.equal(comparedKey("warning"), "checklist.comparedWarning");
  for (const level of ["note", "none", "unchecked", "danger"] as AdditionsLevel[]) {
    assert.equal(comparedKey(level), "checklist.compared", level);
  }
});
