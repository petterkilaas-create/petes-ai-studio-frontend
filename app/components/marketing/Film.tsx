import { IMAGES } from "../../../content/marketing/images";
import type { Film as FilmContent, Site } from "../../../content/marketing/schema";
import { VIDEOS } from "../../../content/marketing/videos";
import { MarketingVideo } from "./MarketingVideo";
import { PendingMark } from "./PendingMark";
import { CONTAINER, H2 } from "./classes";

/**
 * Filmseksjonen (F2, designet Main.dc.html linje 258-277), paa kveldsblaatt
 * (night) som merkingen. Filmen har kontroller og lastes ikke foer den
 * spilles (MarketingVideo, mode="film"). Den er uten lyd, saa ingressen og
 * stegene er tekstversjonen, og videoen peker paa dem med aria-describedby
 * (WCAG 1.2.1). Nummeret paa stegene lages av rekkefoelgen i en ordnet
 * liste, som i Steps.tsx.
 */
export function Film({ film, site }: { film: FilmContent; site: Site }) {
  const titleId = `${film.anchor}-tittel`;
  const leadId = `${film.anchor}-ingress`;
  const stepsId = `${film.anchor}-steg`;

  return (
    <section
      id={film.anchor}
      aria-labelledby={titleId}
      className="bg-night py-[clamp(64px,8vw,112px)] text-paper"
    >
      <div className={`${CONTAINER} flex flex-col gap-9`}>
        <div className="flex max-w-[720px] flex-col gap-3">
          <p className="m-0 text-[14.5px] font-medium text-paper/80">{film.eyebrow}</p>
          <h2 id={titleId} className={`${H2} text-paper`}>
            {film.title}
          </h2>
          <p id={leadId} className="m-0 text-pretty text-[17px] leading-[1.55] text-paper/80">
            {film.lead}
          </p>
        </div>
        <figure className="m-0 flex flex-col gap-2.5">
          <div className="aspect-video w-full overflow-hidden rounded-card bg-ink">
            <MarketingVideo
              src={VIDEOS.film.src}
              poster={IMAGES.filmPoster.src}
              label={film.video.label}
              mode="film"
              labels={site.video}
              describedBy={`${leadId} ${stepsId}`}
            />
          </div>
          <figcaption className="text-[14px] text-paper/80">
            {film.caption}
            {film.video.pending && <PendingMark label={site.pendingLabels.image} />}
          </figcaption>
        </figure>
        <ol id={stepsId} className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {film.steps.map((step, i) => (
            <li key={step} className="flex flex-col gap-1 border-t border-paper/25 pt-3.5">
              <span aria-hidden="true" className="text-[13px] text-paper/80">
                {i + 1}
              </span>
              <span className="text-[16px] font-medium">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
