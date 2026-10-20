import Image from "next/image";
import { IMAGES } from "../../../content/marketing/images";
import type { Hero, Site } from "../../../content/marketing/schema";
import { VIDEOS } from "../../../content/marketing/videos";
import { MarketingVideo } from "./MarketingVideo";
import { PendingMark } from "./PendingMark";

/**
 * Mosaikken i toppen av markedssiden (F3, designet Main.dc.html linje 70-90),
 * i stedet for slideren. Serverkomponent; bare videoloekka kjoerer i
 * nettleseren. All tekst kommer fra innholdet (hero.mosaic).
 *
 * Plassen foelger rekkefoelgen i innholdet (LAYOUT). Fra 768 px er det 6
 * kolonner og 5 rader i en boks med fast forhold 4:3, saa plassen er satt
 * foer bildene kommer (CLS) og kveldsbildet blir omtrent 3:2. Under 768 px
 * er det to kolonner, med kveldsbildet i full bredde i 3:2.
 *
 * Kveldsbildet er ekte og har AI-merket nede til venstre i selve bildet. Det
 * er det stoerste bildet paa siden (LCP) og lastes med hoey prioritet, og
 * utsnittet holdes nede til venstre (object-left-bottom), saa merket aldri
 * kuttes (auditen §3 punkt 2). Det faar derfor ingen egen «AI»-lapp. De
 * andre bildene lastes lat og har lappen nede til venstre i tillegg.
 * Videoloekka har pauseknappen nede til hoeyre (MarketingVideo).
 */

/** Plassen og bredden til hver rute, i rekkefoelgen i innholdet. */
const LAYOUT: readonly { area: string; sizes?: string }[] = [
  // Kveldsbildet, 4x3.
  {
    area: "col-span-2 aspect-[3/2] md:col-span-4 md:row-span-3",
    sizes: "(min-width: 1320px) 480px, (min-width: 1060px) 40vw, (min-width: 768px) 62vw, 100vw",
  },
  // Rydd opp, 2x2.
  {
    area: "aspect-square md:col-span-2 md:row-span-2",
    sizes: "(min-width: 1320px) 240px, (min-width: 1060px) 20vw, (min-width: 768px) 31vw, 50vw",
  },
  // Annonseteksten, 2x1.
  { area: "aspect-square md:col-span-2 md:row-span-1" },
  // Digital styling, 3x2.
  {
    area: "aspect-[4/3] md:col-span-3 md:row-span-2",
    sizes: "(min-width: 1320px) 360px, (min-width: 1060px) 30vw, (min-width: 768px) 46vw, 50vw",
  },
  // Filmen, 3x2.
  { area: "aspect-[4/3] md:col-span-3 md:row-span-2" },
];

const TILE = "relative m-0 min-h-0 overflow-hidden rounded-card md:aspect-auto";

const TAG =
  "pointer-events-none absolute left-2.5 top-2.5 rounded-pill bg-surface px-2.5 py-1 text-[13px] font-medium text-ink";

const AI_TAG =
  "pointer-events-none absolute bottom-2.5 left-2.5 flex size-[26px] items-center justify-center rounded-full bg-surface text-[12px] font-bold tracking-[-0.02em] text-ink";

export function HeroMosaic({ mosaic, aiLabel, site }: { mosaic: Hero["mosaic"]; aiLabel: string; site: Site }) {
  const pending = mosaic.tiles.some(
    (tile) => ("image" in tile && tile.image.pending) || ("video" in tile && tile.video.pending)
  );

  return (
    <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-3">
      <div
        role="group"
        aria-label={mosaic.label}
        className="grid grid-cols-2 gap-2.5 md:aspect-[4/3] md:grid-cols-6 md:grid-rows-5 md:gap-3"
      >
        {mosaic.tiles.map((tile, i) => {
          const { area, sizes = "50vw" } = LAYOUT[i] ?? LAYOUT[LAYOUT.length - 1];
          if ("image" in tile) {
            const lead = i === 0;
            return (
              <figure key={tile.label} className={`${TILE} ${area} bg-surface-2`}>
                {lead ? (
                  <Image
                    src={IMAGES[tile.image.image]}
                    alt={tile.image.alt}
                    fill
                    sizes={sizes}
                    loading="eager"
                    fetchPriority="high"
                    className="object-cover object-left-bottom"
                  />
                ) : (
                  <Image
                    src={IMAGES[tile.image.image]}
                    alt={tile.image.alt}
                    fill
                    sizes={sizes}
                    className="object-cover"
                  />
                )}
                <figcaption className={TAG}>{tile.label}</figcaption>
                {!lead && (
                  <span aria-hidden="true" className={AI_TAG}>
                    {aiLabel}
                  </span>
                )}
              </figure>
            );
          }
          if ("video" in tile) {
            return (
              <figure key={tile.label} className={`${TILE} ${area} bg-night`}>
                <MarketingVideo
                  src={VIDEOS.loop.src}
                  poster={IMAGES.loopPoster.src}
                  label={tile.video.label}
                  mode="loop"
                  labels={site.video}
                />
                <figcaption className={TAG}>{tile.label}</figcaption>
              </figure>
            );
          }
          return (
            <div
              key={tile.label}
              className={`${TILE} ${area} flex flex-col justify-center gap-0.5 bg-ink px-3.5 py-3 text-paper`}
            >
              <p className="m-0 text-[12px] font-medium text-paper/75">{tile.label}</p>
              <p className="m-0 font-display text-[18px] leading-[22px]">{tile.quote}</p>
            </div>
          );
        })}
      </div>
      {/* F3: rydd opp, styling og loekka er midlertidige (pending "image") til de ekte eksemplene er laget. */}
      {pending && (
        <p className="m-0 -ml-2">
          <PendingMark label={site.pendingLabels.image} />
        </p>
      )}
    </div>
  );
}
