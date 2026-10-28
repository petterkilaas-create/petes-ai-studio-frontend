import Image from "next/image";
import { IMAGES } from "../../../content/marketing/images";
import type { Hero } from "../../../content/marketing/schema";

/**
 * Mosaikken i toppen av markedssiden (F3, designet Main.dc.html linje 70-90),
 * i stedet for slideren. Serverkomponent. All tekst kommer fra innholdet
 * (hero.mosaic).
 *
 * Plassen foelger rekkefoelgen i innholdet (LAYOUT). Fra 768 px er det 6
 * kolonner og 5 rader i en boks med fast forhold 4:3, saa plassen er satt
 * foer bildene kommer (CLS) og kveldsbildet blir omtrent 3:2. Under 768 px
 * er det to kolonner, med kveldsbildet i full bredde i 3:2.
 *
 * Kveldsbildet er det stoerste bildet paa siden (LCP) og lastes med hoey
 * prioritet; de andre lastes lat. Dag 58 (F2): alle bildene er ekte og har
 * AI-merket nede til venstre i selve bildet, saa utsnittet holdes nede til
 * venstre (object-left-bottom) og merket kuttes aldri (auditen §3 punkt 2).
 * Ingen bilder faar egen «AI»-lapp. En original uten resultat har teksten
 * fra `example` («Eksempel») nede til venstre (ingen rute etter Dag 58).
 * Dag 58 (Petter 28.10): fire ruter, uten videoloekka. Digital styling
 * staar i full bredde under, saa rutenettet er fylt.
 */

/** Plassen og bredden til hver rute, i rekkefoelgen i innholdet. */
const LAYOUT: readonly { area: string; sizes?: string }[] = [
  // Kveldsbildet, 4x3.
  {
    area: "col-span-2 aspect-[3/2] md:col-span-4 md:row-span-3",
    sizes: "(min-width: 1320px) 480px, (min-width: 1060px) 40vw, (min-width: 768px) 62vw, 100vw",
  },
  // Årstider, 2x2.
  {
    area: "aspect-square md:col-span-2 md:row-span-2",
    sizes: "(min-width: 1320px) 240px, (min-width: 1060px) 20vw, (min-width: 768px) 31vw, 50vw",
  },
  // Blå himmel, 2x1.
  {
    area: "aspect-square md:col-span-2 md:row-span-1",
    sizes: "(min-width: 1320px) 240px, (min-width: 1060px) 20vw, (min-width: 768px) 31vw, 50vw",
  },
  // Digital styling (eksempel), 6x2: full bredde under, ogsaa paa mobil.
  {
    area: "col-span-2 aspect-[3/2] md:col-span-6 md:row-span-2",
    sizes: "(min-width: 1320px) 720px, (min-width: 1060px) 60vw, (min-width: 768px) 92vw, 100vw",
  },
];

const TILE = "relative m-0 min-h-0 overflow-hidden rounded-card md:aspect-auto";

const TAG =
  "pointer-events-none absolute left-2.5 top-2.5 rounded-pill bg-surface px-2.5 py-1 text-[13px] font-medium text-ink";

/** «Eksempel» paa en original: hvit paa ink/80, som paa Tjenester. */
const EXAMPLE_TAG =
  "pointer-events-none absolute bottom-2.5 left-2.5 rounded-pill bg-ink/80 px-2.5 py-1 text-[13px] font-medium text-surface";

export function HeroMosaic({ mosaic }: { mosaic: Hero["mosaic"] }) {
  return (
    <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-3">
      <div
        role="group"
        aria-label={mosaic.label}
        className="grid grid-cols-2 gap-2.5 md:aspect-[4/3] md:grid-cols-6 md:grid-rows-5 md:gap-3"
      >
        {mosaic.tiles.map((tile, i) => {
          const { area, sizes = "50vw" } = LAYOUT[i] ?? LAYOUT[LAYOUT.length - 1];
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
                  className="object-cover object-left-bottom"
                />
              )}
              <figcaption className={TAG}>{tile.label}</figcaption>
              {tile.example && (
                <span aria-hidden="true" className={EXAMPLE_TAG}>
                  {tile.example}
                </span>
              )}
            </figure>
          );
        })}
      </div>
    </div>
  );
}
