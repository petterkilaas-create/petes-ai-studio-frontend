import { test } from "node:test";
import assert from "node:assert/strict";
import { jobMessage } from "./jobMessage.ts";
import { DICTIONARIES, messageText, type Locale } from "./i18n/index.ts";

const LOCALES: Locale[] = ["nb", "en"];

// Som SAM3-feilen fra 25.09: JSON, fal-URL og gjentakelser.
const RAW_ERROR =
  'sam3: HTTPStatusError: {"detail":[{"msg":"failed","url":"https://queue.fal.run/fal-ai/sam-3/requests/abc"}]} ' +
  "fireplace_answer_missing: analysen fant peis, og fireplace_fire mangler";

function shown(locale: Locale, status: string, code: unknown): string | null {
  const message = jobMessage(status, code);
  return message === null ? null : messageText(locale, message);
}

test("kjente koder for Til gjennomgang gir riktig noekkel og tekst", () => {
  for (const code of ["gate_review", "fireplace_answer_missing", "needs_review"]) {
    assert.deepEqual(jobMessage("needs_review", code), { group: "reviewCode", code });
  }
  assert.equal(shown("nb", "needs_review", "fireplace_answer_missing"), "Venter på svar om peisen.");
  assert.equal(shown("nb", "needs_review", "gate_review"), "Bildet må sjekkes før vi lager det.");
  assert.equal(shown("nb", "needs_review", "needs_review"), "Bildet må sjekkes før vi lager det.");
  assert.equal(shown("en", "needs_review", "fireplace_answer_missing"), "Waiting for an answer about the fireplace.");
});

test("feilet og avvist gir riktig noekkel", () => {
  assert.deepEqual(jobMessage("failed", null), { key: "job.failed" });
  assert.deepEqual(jobMessage("failed", "some_future_code"), { key: "job.failed" });
  assert.deepEqual(jobMessage("rejected", null), { key: "job.rejected" });
  assert.equal(shown("nb", "failed", null), "Bildet kunne ikke behandles. Prøv igjen, eller kontakt oss.");
  assert.equal(shown("en", "failed", null), "The image could not be processed. Please try again, or contact us.");
  assert.equal(shown("nb", "rejected", null), "Bildet passet ikke for dette verktøyet og ble ikke laget.");
});

test("ukjent og manglende kode gir generisk melding, aldri krasj", () => {
  for (const locale of LOCALES) {
    for (const code of ["brand_new_code", "", null, undefined, 42, "__proto__", "toString", {}]) {
      assert.equal(shown(locale, "needs_review", code), DICTIONARIES[locale].generic.reviewCode, String(code));
      assert.equal(shown(locale, "failed", code), DICTIONARIES[locale].ui["job.failed"], String(code));
    }
  }
});

test("statuser uten melding gir null, ogsaa ukjente", () => {
  for (const status of ["succeeded", "queued", "running", "awaiting_approval", "unknown", "teleported", "", "__proto__"]) {
    assert.equal(jobMessage(status, "fireplace_answer_missing"), null, status);
  }
});

test("teksten som vises inneholder aldri error-feltet, en URL eller {", () => {
  for (const locale of LOCALES) {
    for (const status of ["failed", "rejected", "needs_review"]) {
      for (const code of [null, "", "rejected_by_reviewer", "fireplace_answer_missing", RAW_ERROR]) {
        const text = shown(locale, status, code);
        assert.ok(text !== null && text.trim().length > 0, `${locale}/${status}`);
        assert.ok(!text.includes(RAW_ERROR), text);
        assert.ok(!/https?:\/\//.test(text), text);
        assert.ok(!text.includes("{"), text);
        assert.ok(!text.includes("_"), `koden lekker: ${text}`);
      }
    }
  }
});

test("rejected_by_reviewer gir fortsatt Avvist av deg", () => {
  assert.deepEqual(jobMessage("failed", "rejected_by_reviewer"), { key: "status.rejectedByYou" });
  assert.equal(shown("nb", "failed", "rejected_by_reviewer"), "Avvist av deg");
  assert.equal(shown("en", "failed", "rejected_by_reviewer"), "Rejected by you");
});

test("nb og en har de nye noeklene", () => {
  for (const key of ["job.failed", "job.rejected", "history.loadError"] as const) {
    for (const locale of LOCALES) {
      assert.ok(DICTIONARIES[locale].ui[key].trim().length > 0, `${locale}/${key}`);
    }
    assert.notEqual(DICTIONARIES.nb.ui[key], DICTIONARIES.en.ui[key], key);
  }
});
