import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lekkasjen L2: ingen side viser de umerkede bildene. Feltene staar i
 * API-svaret til L3 og i typene til L4, men ingen .tsx-fil skal lese dem.
 * Visningen gaar gjennom rene funksjoner (review.ts, jobState.ts,
 * statusVariants.ts) som bare tar de merkede feltene.
 */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(path));
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const OLD_FIELDS =
  /\b(resultUrl|rawUrl|variantUrls|result_url|raw_url|variant_urls)\b|X-Result-URL/;

test("ingen .tsx-fil bruker resultUrl, rawUrl eller variantUrls (Lekkasjen L2)", () => {
  const files = tsxFiles(APP_DIR);
  assert.ok(files.length > 10, "fant .tsx-filene");
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), OLD_FIELDS, file);
  }
});

test("sidene henter KI-bildet fra de merkede feltene", () => {
  const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");
  assert.match(read("history/page.tsx"), /thumbSrc\(job\)/);
  assert.match(read("godkjenning/[jobId]/page.tsx"), /resultImageUrl\(review\.images/);
  assert.match(read("express/page.tsx"), /outputView\(job\.status, job\.imageUrl\)/);
  assert.match(read("express/page.tsx"), /<PreviewPlaceholder \/>/);
  assert.match(read("godkjenning/[jobId]/page.tsx"), /<PreviewPlaceholder \/>/);
});
