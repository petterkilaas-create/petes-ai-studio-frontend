import { DEFAULT_DUSK } from "../../lib/dusk";
import type { Moods as MoodsContent, Site } from "../../../content/marketing/schema";
import { MoodPicker } from "./MoodPicker";
import { CONTAINER, H2, LEAD, SECTION_Y } from "./classes";

/**
 * Stemningene (MS3, utkastet linje 125-163): overskrift, ingress og linja om
 * peis her (serverkomponent), valget i MoodPicker (klientdel). Startvalget
 * er appens standard (DEFAULT_DUSK), og navnene er appens (testen sjekker).
 */
export function Moods({ moods, site }: { moods: MoodsContent; site: Site }) {
  return (
    <section aria-labelledby="stemninger-tittel" className={SECTION_Y}>
      <div className={`${CONTAINER} flex flex-col gap-8`}>
        <div className="flex flex-col gap-4">
          <h2 id="stemninger-tittel" className={H2}>
            {moods.title}
          </h2>
          <p className={LEAD}>{moods.lead}</p>
        </div>
        <MoodPicker
          groups={moods.groups}
          defaultSky={DEFAULT_DUSK.sky}
          fireplaceNote={moods.fireplaceNote}
          placeholderCaption={moods.placeholderCaption}
          placeholderTitle={site.imagePlaceholder}
          pendingLabel={site.pendingLabels.image}
        />
      </div>
    </section>
  );
}
