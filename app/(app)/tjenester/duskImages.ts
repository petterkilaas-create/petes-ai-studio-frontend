import type { StaticImageData } from "next/image";
import type { DuskStyle } from "@/app/lib/dusk";
import blueHour from "./bilder/kveld/01_blaa_time.jpg";
import warmDusk from "./bilder/kveld/02_varm_skumring.jpg";
import lateEvening from "./bilder/kveld/03_sen_kveld.jpg";
import summerNight from "./bilder/kveld/04_lys_sommerkveld.jpg";

/**
 * Eksempelbildene paa stilkortene for Kveldsbilde (Dag 55, TG-NEW-259), ett
 * per kort, med statisk import som styleImages.ts (node --test kan ikke laste
 * .jpg). Statisk import gir bredde, hoeyde og en URL med innholdshash, saa et
 * nytt bilde med samme navn vises etter neste deploy.
 *
 * Bytt bildene med `node scripts/kveld/lag-kortbilder.ts <mappe>`, som skriver
 * over filene med samme navn; denne fila endres ikke.
 */
export const DUSK_IMAGES: Record<DuskStyle, StaticImageData> = {
  nordic_blue_hour_v2: blueHour,
  warm_dusk_v3: warmDusk,
  late_evening_v1: lateEvening,
  summer_night_v1: summerNight,
};
