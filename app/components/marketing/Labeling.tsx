import { Check } from "lucide-react";
import { DISCLOSURE_DETAIL, DISCLOSURE_LOCALE, disclosureText } from "../../lib/disclosure";
import type { Labeling as LabelingContent, Site } from "../../../content/marketing/schema";
import { MarketingPicture } from "./MarketingPicture";
import { PendingMark } from "./PendingMark";
import { CONTAINER, FOCUS, H2 } from "./classes";

/**
 * Merkingen (MS3b, utkastet linje 247-266), paa kveldsblaatt (night).
 * Eksempelet paa teksten til annonsen lages med produktets funksjon
 * (disclosureText, samme detaljnivaa og spraak som i appen), saa siden
 * aldri viser en annen tekst enn den megleren faar. Gir funksjonen ingen
 * tekst, vises ingen boks. Guiden finnes ikke ennaa (MS5b): tekst uten lenke.
 * MS5a: lenken til merkesiden.
 */
const SIZES = "(min-width: 1320px) 600px, (min-width: 1024px) 45vw, 100vw";

export function Labeling({ labeling, site }: { labeling: LabelingContent; site: Site }) {
  const { example } = labeling;
  const disclosure = disclosureText(
    DISCLOSURE_LOCALE,
    {
      version: null,
      base: example.base,
      time: example.time,
      scope: null,
      edited: [...example.edited],
      source: null,
      status: "ok",
    },
    DISCLOSURE_DETAIL
  );

  return (
    <section
      id={labeling.anchor}
      aria-labelledby={`${labeling.anchor}-tittel`}
      className="bg-night py-[clamp(64px,8vw,112px)] text-paper"
    >
      <div className={`${CONTAINER} grid grid-cols-1 items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2`}>
        <div className="flex flex-col gap-5">
          <p className="m-0 text-[14.5px] font-medium text-paper/80">{labeling.eyebrow}</p>
          <h2 id={`${labeling.anchor}-tittel`} className={`${H2} text-paper`}>
            {labeling.title}
          </h2>
          <p className="m-0 max-w-[36em] text-pretty text-[17px] leading-[1.55] text-paper/80">{labeling.lead}</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {labeling.points.map((point) => (
              <li key={point.text} className="flex items-start gap-2.5 text-[15.5px] leading-[1.5]">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
                <span>
                  {point.text}
                  {point.pending && <PendingMark label={site.pendingLabels[point.pending]} />}
                </span>
              </li>
            ))}
          </ul>
          <a
            href={labeling.more.href}
            className={`flex min-h-11 items-center self-start rounded-button text-[16px] font-medium text-paper underline underline-offset-4 ${FOCUS}`}
          >
            {labeling.more.label}
          </a>
          <p className="m-0 text-[15px] font-medium text-paper/80">{labeling.guide.label}</p>
        </div>
        <figure className="m-0 flex flex-col gap-4">
          <MarketingPicture
            picture={labeling.picture}
            sizes={SIZES}
            placeholderTitle={site.imagePlaceholder}
            pendingLabel={site.pendingLabels.image}
          />
          {disclosure?.kind === "text" && (
            <figcaption className="flex flex-col gap-2 rounded-card bg-surface p-5 text-ink">
              <span className="text-[13.5px] font-semibold text-ink-2">{example.title}</span>
              <span className="text-[16px] leading-[1.5]">{disclosure.text}</span>
              <span className="text-[13.5px] text-ink-2">{example.note}</span>
            </figcaption>
          )}
        </figure>
      </div>
    </section>
  );
}
