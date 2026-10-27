import { test } from "node:test";
import assert from "node:assert/strict";
import { stopReasons } from "./review.ts";
import { t } from "./i18n/index.ts";

// TG-NEW-219 (dag 47): megleren ser grunnen naar Blaa himmel stopper et
// bilde i port 1. Fra porten (Dag 56, P3a) gaar det gjennom stopReasons, som
// dekker alle grunnene (porttekster.test.ts); her de tre fra TG-NEW-219.

function stopped(reasonCodes: string[], status = "needs_review", code: string | null = "gate_review") {
  return { status, code, reasonCodes, allowedActions: ["reject" as const], presetId: "klart_vaer", imageType: { value: null, runValues: [] } };
}

test("TG-NEW-219: de tre kodene for Blå himmel gir tekstene sine, ordrett", () => {
  const expected = {
    image_type_not_supported: "Blå himmel kan ikke brukes på bilder tatt innendørs.",
    sky_missing: "Bildet har ingen himmel som kan byttes.",
    sky_through_windows_only: "Himmelen synes bare gjennom vinduer.",
  };
  for (const [code, text] of Object.entries(expected)) {
    const keys = stopReasons(stopped([code]));
    assert.equal(keys.length, 1, code);
    assert.equal(t("nb", keys[0]), text, code);
  }
});

test("TG-NEW-219: bare ved stopp (needs_review)", () => {
  assert.deepEqual(stopReasons(stopped(["sky_missing"], "awaiting_approval")), []);
  assert.deepEqual(stopReasons(stopped(["sky_missing"], "failed")), []);
});
