import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lekkasjen L2/L4: ingen side viser de umerkede bildene. Etter L3 sender
 * backend dem ikke, og fra L4 finnes feltene heller ikke i typer, parsere
 * eller kommentarer. Visningen gaar gjennom rene funksjoner (review.ts,
 * jobState.ts, statusVariants.ts) som bare tar de merkede feltene.
 */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const OLD_FIELDS =
  /\b(resultUrl|rawUrl|variantUrls|result_url|raw_url|variant_urls)\b|X-Result-URL/;

test("ingen .ts- eller .tsx-fil nevner de gamle bildefeltene (Lekkasjen L4)", () => {
  const files = sourceFiles(APP_DIR);
  assert.ok(files.some((f) => f.endsWith("api.ts")), "fant .ts-filene");
  assert.ok(files.some((f) => f.endsWith("page.tsx")), "fant .tsx-filene");
  assert.ok(!files.some((f) => f.endsWith(".test.ts")), "testene er unntatt");
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), OLD_FIELDS, file);
  }
});

test("sidene henter KI-bildet fra de merkede feltene", () => {
  const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");
  assert.match(read("(app)/history/page.tsx"), /thumbSrc\(job\)/);
  assert.match(read("(app)/godkjenning/[jobId]/page.tsx"), /resultImageUrl\(review\.images/);
  assert.match(read("(app)/tjenester/page.tsx"), /outputView\(job\.status, job\.imageUrl\)/);
  assert.match(read("(app)/tjenester/page.tsx"), /<PreviewPlaceholder \/>/);
  assert.match(read("(app)/godkjenning/[jobId]/page.tsx"), /<PreviewPlaceholder \/>/);
});

test("pollJob har ingen gren for bytes; sync privacy_blur beholder sin (L4)", () => {
  const api = readFileSync(join(APP_DIR, "lib/api.ts"), "utf8");
  const poll = api.slice(api.indexOf("export async function pollJob"));
  const pollBody = poll.slice(0, poll.indexOf("\n}\n"));
  assert.ok(pollBody.includes("parseStatusBody"), "fant pollJob");
  assert.doesNotMatch(pollBody, /\.blob\(|image\/png|X-Job-ID/);
  const submit = api.slice(api.indexOf("export async function submitJob"));
  assert.match(submit.slice(0, submit.indexOf("\n}\n")), /kind: "sync", imageBlob/);
  const hook = readFileSync(join(APP_DIR, "hooks/useProcessJob.ts"), "utf8");
  assert.match(hook, /URL\.createObjectURL\(result\.imageBlob\)/);
  assert.match(hook, /setSyncResultUrl\(url\)/);
  assert.match(hook, /imageUrl: syncResultUrl \?\? job\.imageUrl/);
});
