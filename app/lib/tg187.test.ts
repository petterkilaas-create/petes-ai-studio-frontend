import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// TG-NEW-187: et nytt bilde paa Tjenester nullstiller jobben, saa feilen,
// avslaget og et gammelt resultat ikke staar ved siden av det nye bildet.
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** Kroppen til `const <name> = ...` fram til den lukkende `}` paa samme innrykk (ogsaa `}, [deps]);`). */
function body(src: string, name: string): string {
  const start = src.indexOf(`  const ${name} = `);
  assert.notEqual(start, -1, `fant ikke ${name}`);
  const end = src.indexOf("\n  }", start);
  assert.notEqual(end, -1, `fant ikke slutten paa ${name}`);
  return src.slice(start, end);
}

const page = read("(app)/tjenester/page.tsx");
const hook = read("hooks/useProcessJob.ts");

test("TG187: filvelgeren paa Tjenester bruker handleFileChange og er laast mens en jobb kjoerer", () => {
  const input = page.slice(page.indexOf('id="express-file"'), page.indexOf("/>", page.indexOf('id="express-file"')));
  assert.match(input, /onChange=\{handleFileChange\}/);
  assert.match(input, /disabled=\{isProcessing\}/);
  assert.doesNotMatch(page, /onChange=\{preview\.onInputChange\}/);
});

test("TG187: et nytt filvalg nullstiller jobben, men ikke mens en jobb kjoerer", () => {
  const fn = body(page, "handleFileChange");
  const guard = fn.indexOf("if (isProcessing) return;");
  const pick = fn.indexOf("preview.onInputChange(e);");
  const reset = fn.indexOf("job.reset();");
  assert.ok(guard !== -1 && pick !== -1 && reset !== -1, fn);
  assert.ok(guard < pick && guard < reset, "vakten maa komme foer filvalget og reset");
});

test("TG187: et nytt filvalg beholder skumringsvalgene og bildetypen", () => {
  const fn = body(page, "handleFileChange");
  assert.doesNotMatch(fn, /setDusk|setSceneType|setForceSceneType|preview\.clear/);
});

test("TG187: reset toemmer feilen, grunnen, jobben og forrige kjoering", () => {
  const fn = body(hook, "reset");
  for (const call of [
    "setSubmitError(null);",
    "setSubmitErrorCode(null);",
    "setSubmitErrorReason(null);",
    // jobId null: useJobStatus toemmer avslaget, vurderingen og resultatet.
    "setJobId(null);",
    "setSyncResultUrl(null);",
  ]) {
    assert.ok(fn.includes(call), `reset mangler ${call}`);
  }
});

test("TG187: reset glemmer forrige kjoering, saa «Fortsett som eksterioer» ikke sender det gamle bildet", () => {
  assert.ok(body(hook, "reset").includes("lastRunRef.current = null;"));
  // resubmitForced gjoer ingenting uten forrige kjoering.
  assert.match(body(hook, "resubmitForced"), /const last = lastRunRef\.current;\s*if \(!last\) return;/);
});
