/**
 * Skalerer eksempelbildene til stilvelgeren (D-3): bredde 960, JPEG
 * kvalitet 82, uten EXIF og andre metadata (sharp tar dem bort som
 * standard). Skriver over filene med samme navn i
 * app/(app)/tjenester/bilder/stiler/, saa ingen kode endres naar Petter
 * bytter bildene. Originalene kopieres aldri inn i repoet.
 *
 *   node scripts/moodboards/lag-bilder.ts ~/dev/_handoff/dag54/stilprobe/bilder
 *
 * Mappa maa ha ett bilde per stil, `NN_<id>.jpg` (for eksempel
 * `01_styling_moderne_nordisk.jpg`); navnene staar i app/lib/moodboards.json.
 * `sharp` kommer med Next (bildeoptimering) og staar ikke i package.json
 * (Petter 25.10, valg S).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = process.argv[2];
if (!dir) {
  console.error("Bruk: node scripts/moodboards/lag-bilder.ts <mappe med NN_<id>.jpg>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(new URL("../../app/lib/moodboards.json", import.meta.url), "utf8")) as {
  stiler: { bilde: string }[];
};
const outDir = fileURLToPath(new URL("../../app/(app)/tjenester/bilder/stiler/", import.meta.url));

const missing = data.stiler.map((s) => s.bilde).filter((f) => !existsSync(join(dir, f)));
if (missing.length > 0) {
  console.error(`Mangler i ${dir}: ${missing.join(", ")}`);
  process.exit(1);
}

for (const { bilde } of data.stiler) {
  const info = await sharp(join(dir, bilde))
    .rotate()
    .resize({ width: 960 })
    .jpeg({ quality: 82 })
    .toFile(join(outDir, bilde));
  console.log(`${bilde}: ${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB`);
}
