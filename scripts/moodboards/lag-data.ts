/**
 * Lager app/lib/moodboards.json fra moodboardene og romikonene i
 * Styling.dc.html (D-3). Kjoeres fra
 * repo-rota naar Cowork leverer nye moodboard:
 *
 *   node scripts/moodboards/lag-data.ts ~/dev/_handoff/dag54/moodboard ~/dev/_handoff/dag54/stilprobe/stilpakker_v3.json
 *
 * Kopier deretter de nye kildene byte-likt til app/lib/testdata/ og oppdater
 * sha-ene i moodboards.test.ts; testen lager fila paa nytt fra kopiene.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildData, formatData } from "./data.ts";

const [dir, packages] = process.argv.slice(2);
if (!dir || !packages) {
  console.error("Bruk: node scripts/moodboards/lag-data.ts <moodboard-mappe> <stilpakker_v3.json>");
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((f) => /^Stil\d\d_.*\.dc\.html$/.test(f))
  .sort();
const htmls = files.map((f) => readFileSync(join(dir, f), "utf8"));
const styling = readFileSync(join(dir, "Styling.dc.html"), "utf8");
const data = buildData(htmls, JSON.parse(readFileSync(packages, "utf8")), styling);
const out = new URL("../../app/lib/moodboards.json", import.meta.url);
writeFileSync(out, formatData(data));
console.log(`Skrev ${data.stiler.length} stiler fra ${files.length} filer til app/lib/moodboards.json`);
