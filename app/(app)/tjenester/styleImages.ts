import type { StaticImageData } from "next/image";
import type { StylingStyle } from "@/app/lib/styling";
import moderneNordisk from "./bilder/stiler/01_styling_moderne_nordisk.jpg";
import japandi from "./bilder/stiler/02_styling_japandi.jpg";
import nordiskKlassisk from "./bilder/stiler/03_styling_nordisk_klassisk.jpg";
import varmMinimalisme from "./bilder/stiler/04_styling_varm_minimalisme.jpg";
import sekelskifte from "./bilder/stiler/05_styling_sekelskifte.jpg";
import funkis from "./bilder/stiler/06_styling_funkis.jpg";
import byVintage from "./bilder/stiler/07_styling_by_vintage.jpg";
import syttitall from "./bilder/stiler/08_styling_syttitall.jpg";
import danskFarge from "./bilder/stiler/09_styling_dansk_farge.jpg";
import pastell from "./bilder/stiler/10_styling_pastell.jpg";
import nordiskKyst from "./bilder/stiler/11_styling_nordisk_kyst.jpg";
import hytteTradisjon from "./bilder/stiler/12_styling_hytte_tradisjon.jpg";
import hytteFjell from "./bilder/stiler/13_styling_hytte_fjell.jpg";
import urbanIndustri from "./bilder/stiler/14_styling_urban_industri.jpg";

/**
 * Eksempelbildene i stilvelgeren (D-3, dag 54), ett per stil, med statisk
 * import som cardImages.ts (node --test kan ikke laste .jpg). Statisk import
 * gir bredde, hoeyde og en URL med innholdshash, saa et nytt bilde med samme
 * navn vises etter neste deploy.
 *
 * Bildene er plassholdere: stilproben i referansestua 13861317 (rettighetene
 * bekreftet av Petter, D-1). Bytt dem med
 * `node scripts/moodboards/lag-bilder.ts <mappe>`, som skriver over filene med
 * samme navn; denne fila endres ikke.
 */
export const STYLE_IMAGES: Record<StylingStyle, StaticImageData> = {
  styling_moderne_nordisk: moderneNordisk,
  styling_japandi: japandi,
  styling_nordisk_klassisk: nordiskKlassisk,
  styling_varm_minimalisme: varmMinimalisme,
  styling_sekelskifte: sekelskifte,
  styling_funkis: funkis,
  styling_by_vintage: byVintage,
  styling_syttitall: syttitall,
  styling_dansk_farge: danskFarge,
  styling_pastell: pastell,
  styling_nordisk_kyst: nordiskKyst,
  styling_hytte_tradisjon: hytteTradisjon,
  styling_hytte_fjell: hytteFjell,
  styling_urban_industri: urbanIndustri,
};
