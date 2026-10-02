import Image from "next/image";
import { IMAGES } from "../../../content/marketing/images";
import type { Picture } from "../../../content/marketing/schema";
import { PendingMark } from "./PendingMark";

/**
 * Et bilde paa markedssiden i en fast 3:2-boks, saa plassen er satt foer
 * bildet kommer (CLS). Et bilde fra images.ts lastes lat (bare toppbildet
 * har hoey prioritet, i HeroSlider). En plassholder er en noeytral boks med
 * tekst fra innholdet og merkelappen [BILDE]. Midlertidige bilder
 * (pending "image") faar ogsaa merkelappen.
 *
 * Ingen hooks, saa fanene og stemningene (klientdeler) kan bruke den.
 */
export function MarketingPicture({
  picture,
  sizes,
  placeholderTitle,
  pendingLabel,
}: {
  picture: Picture;
  sizes: string;
  /** site.imagePlaceholder, over beskrivelsen i plassholderen. */
  placeholderTitle: string;
  /** site.pendingLabels.image. */
  pendingLabel: string;
}) {
  if ("placeholder" in picture) {
    return (
      <div className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-line-strong bg-surface-2 p-6 text-center">
        <p className="m-0 text-[15px] font-medium text-ink">
          {placeholderTitle}
          <PendingMark label={pendingLabel} />
        </p>
        <p className="m-0 text-[13.5px] text-ink-2">{picture.placeholder}</p>
      </div>
    );
  }
  return (
    <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[14px] bg-surface-2">
      <Image src={IMAGES[picture.image]} alt={picture.alt} fill sizes={sizes} className="object-cover" />
      {picture.pending && (
        <span className="absolute left-2 top-2">
          <PendingMark label={pendingLabel} />
        </span>
      )}
    </div>
  );
}
