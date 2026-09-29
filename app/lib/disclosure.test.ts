import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISCLOSURE_DETAIL,
  DISCLOSURE_LOCALE,
  disclosureText,
  joinList,
  type ReviewDisclosure,
} from "./disclosure.ts";

const BASE_NB = "Kveldsbilde laget med AI fra dagsbilde.";
const BASE_EN = "Evening image created with AI from a daytime photo.";

function d(edited: string[] | null, extra: Partial<ReviewDisclosure> = {}): ReviewDisclosure {
  return {
    version: "1",
    base: "evening_from_day",
    time: "late",
    scope: "exterior",
    edited,
    source: "recorded",
    status: "ok",
    ...extra,
  };
}

function text(result: ReturnType<typeof disclosureText>): string | null {
  return result?.kind === "text" ? result.text : null;
}

test("standardvalgene: lista uten tidspunkt, og teksten er norsk (Petter 29.09)", () => {
  assert.equal(DISCLOSURE_DETAIL, "edited");
  assert.equal(DISCLOSURE_LOCALE, "nb");
});

test("de to eksemplene fra Petter, ordrett", () => {
  assert.equal(
    text(disclosureText("nb", d(["sky", "window_lights", "exterior_lamps"]), "edited")),
    "Kveldsbilde laget med AI fra dagsbilde. Himmel, lys i vinduer og utelys er redigert."
  );
  assert.equal(
    text(
      disclosureText("nb", d(["sky", "interior_lamps", "candles", "fireplace_fire"], { scope: "interior" }), "edited")
    ),
    "Kveldsbilde laget med AI fra dagsbilde. Himmel, lamper i rommet, stearinlys og ild i peisen er redigert."
  );
});

test("nb: tom liste, ett, to og fire ledd, med stor forbokstav", () => {
  assert.equal(text(disclosureText("nb", d([]), "edited")), BASE_NB);
  assert.equal(text(disclosureText("nb", d(["sky"]), "edited")), `${BASE_NB} Himmel er redigert.`);
  assert.equal(
    text(disclosureText("nb", d(["candles", "fireplace_fire"]), "edited")),
    `${BASE_NB} Stearinlys og ild i peisen er redigert.`
  );
  assert.equal(
    text(disclosureText("nb", d(["sky", "interior_lamps", "candles", "fireplace_fire"]), "edited")),
    `${BASE_NB} Himmel, lamper i rommet, stearinlys og ild i peisen er redigert.`
  );
});

test("en: tom liste, ett, to og fire ledd, has/have", () => {
  assert.equal(text(disclosureText("en", d([]), "edited")), BASE_EN);
  assert.equal(text(disclosureText("en", d(["sky"]), "edited")), `${BASE_EN} Sky has been edited.`);
  assert.equal(
    text(disclosureText("en", d(["window_lights", "exterior_lamps"]), "edited")),
    `${BASE_EN} Lights in windows and outdoor lights have been edited.`
  );
  assert.equal(
    text(disclosureText("en", d(["sky", "window_lights", "neighbour_window_lights", "exterior_lamps"]), "edited")),
    `${BASE_EN} Sky, lights in windows, lights in neighbouring houses and outdoor lights have been edited.`
  );
});

test("joinList: nb og en, uten komma foran og/and", () => {
  assert.equal(joinList("nb", []), "");
  assert.equal(joinList("nb", ["a"]), "a");
  assert.equal(joinList("nb", ["a", "b", "c"]), "a, b og c");
  assert.equal(joinList("en", ["a", "b", "c"]), "a, b and c");
});

test("null gir null (ingen boks)", () => {
  assert.equal(disclosureText("nb", null, "edited"), null);
});

test("ukjent base, ukjent kode, duplikat og ugyldig liste gir ingen tekst", () => {
  const missing = { kind: "missing" };
  for (const detail of ["base", "edited", "full"] as const) {
    assert.deepEqual(disclosureText("nb", d(["sky"], { base: "night_from_day" }), detail), missing);
    assert.deepEqual(disclosureText("nb", d(["sky"], { base: null }), detail), missing);
    assert.deepEqual(disclosureText("nb", d(["sky", "pool_lights"]), detail), missing);
    assert.deepEqual(disclosureText("nb", d(["__proto__"]), detail), missing);
    assert.deepEqual(disclosureText("nb", d(["sky", "sky"]), detail), missing);
    assert.deepEqual(disclosureText("nb", d(null), detail), missing);
  }
});

test("status: bare ok gir tekst; unverified, ukjent og manglende gir ingen tekst", () => {
  assert.equal(disclosureText("nb", d(["sky"]), "edited")?.kind, "text");
  for (const status of ["unverified", "OK", null]) {
    assert.deepEqual(disclosureText("nb", d(["sky"], { status }), "edited"), { kind: "missing" });
  }
});

test("detaljnivaa: edited uten tidspunkt, base bare grunnsetningen, full med tidspunkt", () => {
  const job = d(["sky", "window_lights"]);
  const edited = text(disclosureText("nb", job, "edited"));
  assert.equal(edited, `${BASE_NB} Himmel og lys i vinduer er redigert.`);
  assert.ok(!edited?.includes("Tidspunkt"));
  assert.equal(text(disclosureText("nb", job, "base")), BASE_NB);
  assert.equal(
    text(disclosureText("nb", job, "full")),
    `${BASE_NB} Tidspunkt: sen kveld. Himmel og lys i vinduer er redigert.`
  );
  assert.equal(
    text(disclosureText("en", d([], { time: "early" }), "full")),
    `${BASE_EN} Time of day: early dusk.`
  );
});

test("tidspunktet sjekkes bare naar det vises", () => {
  const job = d(["sky"], { time: "midnight" });
  assert.equal(disclosureText("nb", job, "edited")?.kind, "text");
  assert.deepEqual(disclosureText("nb", job, "full"), { kind: "missing" });
});
