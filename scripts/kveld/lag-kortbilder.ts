/**
 * Skalerer eksempelbildene til stilkortene for Kveldsbilde (Dag 55): bredde
 * 960, JPEG kvalitet 82, uten EXIF og andre metadata (sharp tar dem bort som
 * standard), som scripts/moodboards/lag-bilder.ts. Skriver over filene med
 * samme navn i app/(app)/tjenester/bilder/kveld/, saa ingen kode endres naar
 * Petter bytter bildene. Originalene kopieres aldri inn i repoet.
 *
 *   node scripts/kveld/lag-kortbilder.ts ~/dev/_handoff/dag55/kortbilder
 *
 * Mappa maa ha de fire navnene i BILDER (samme navn som i duskImages.ts).
 * `sharp` kommer med Next og staar ikke i package.json (Petter 25.10, valg S).
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BILDER = ["01_blaa_time.jpg", "02_varm_skumring.jpg", "03_sen_kveld.jpg", "04_lys_sommerkveld.jpg"];

const dir = process.argv[2];
if (!dir) {
  console.error("Bruk: node scripts/kveld/lag-kortbilder.ts <mappe med de fire bildene>");
  process.exit(1);
}

const outDir = fileURLToPath(new URL("../../app/(app)/tjenester/bilder/kveld/", import.meta.url));

mkdirSync(outDir, { recursive: true });

const missing = BILDER.filter((f) => !existsSync(join(dir, f)));
if (missing.length > 0) {
  console.error(`Mangler i ${dir}: ${missing.join(", ")}`);
  process.exit(1);
}

for (const bilde of BILDER) {
  const info = await sharp(join(dir, bilde))
    .rotate()
    .resize({ width: 960 })
    .jpeg({ quality: 82 })
    .toFile(join(outDir, bilde));
  console.log(`${bilde}: ${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB`);
}
