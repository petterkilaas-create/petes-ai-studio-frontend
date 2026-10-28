import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { t, type Locale } from "../lib/i18n";
import type { VisibleTool } from "../lib/services";
import type { CardSize, ServiceCardText } from "../lib/serviceCards";
import type { CardImages } from "../(app)/tjenester/cardImages";
import { cardClass } from "./ui/Card";

/**
 * Et stort tjenestekort paa Tjenester (D-1, dag 54, tegnebrett 1): foer/etter-
 * bilde i 3:2, tittel, linja, to brikker og knappeteksten. Hele kortet er én
 * knapp med aria-pressed, som foer. Bildet er statisk; slideren kommer i D-2.
 *
 * Speilvendt fra designet, som forsiden (F4, Services.tsx): resultatet ligger
 * under og vises helt, originalen ligger over og klippes til hoeyre halvdel.
 * Resultatet staar altsaa til venstre, fordi det ekte AI-merket staar nede til
 * venstre i bildet og maa synes (D1_SVAR punkt 1). Begge bildene har samme
 * utsnitt nede til venstre (object-left-bottom).
 *
 * Bildene er pynt inne i knappen (alt=""): navnet er tittelen og
 * beskrivelsen er linja, saa skjermleseren ikke leser bilder og brikker som
 * en del av navnet.
 *
 * Lite kort (`size="small"`, Dag 58 del 4): samme knapp og tekster, uten
 * bilde og med mindre tittel. De store staar tre i én rad fra 1024 px, saa
 * tittelen er 38 px foerst fra 1280 px.
 */

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

// Tre kort i én rad fra 1024 px (Dag 58): hoeyst ca. 350 px bredt.
const SIZES = "(min-width: 1024px) 360px, 100vw";

const IMAGE = "object-cover object-left-bottom";

/** Lappene oppaa bildet: hvit paa ink/80, minst 4,5:1 over et lyst bilde. */
const TAG = "pointer-events-none absolute top-4 rounded-pill bg-ink/80 px-3 py-1.5 text-[13px] font-medium text-surface";

export function ServiceCard({
  tool,
  text,
  images,
  selected,
  disabled,
  onSelect,
  locale,
  size = "large",
}: {
  tool: VisibleTool;
  text: ServiceCardText;
  images: CardImages | undefined;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  locale: Locale;
  size?: CardSize;
}) {
  const small = size === "small";
  const titleId = `tjeneste-${tool.id}`;
  const descId = `tjeneste-${tool.id}-linje`;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={cardClass(
        "none",
        `flex h-full flex-col overflow-hidden text-left transition-colors disabled:cursor-not-allowed ${FOCUS} ${
          selected ? "border-ink ring-1 ring-ink" : "hover:border-line-strong"
        }`
      )}
    >
      {!small && (
        <span className="relative block aspect-[3/2] w-full overflow-hidden bg-surface-2">
          {images?.after ? (
            <>
              <Image src={images.after} alt="" fill sizes={SIZES} className={IMAGE} />
              <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
                <Image src={images.before} alt="" fill sizes={SIZES} className={IMAGE} />
              </span>
              <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-surface" />
              <span aria-hidden="true" className={`${TAG} left-4`}>
                {t(locale, "express.card.afterAi")}
              </span>
              <span aria-hidden="true" className={`${TAG} right-4`}>
                {t(locale, "express.card.before")}
              </span>
            </>
          ) : images ? (
            <>
              <Image src={images.before} alt="" fill sizes={SIZES} className={IMAGE} />
              <span aria-hidden="true" className={`${TAG} left-4`}>
                {t(locale, "express.card.example")}
              </span>
            </>
          ) : null}
        </span>
      )}
      <span className={`flex flex-1 flex-col ${small ? "gap-3 p-5" : "gap-3.5 p-6 lg:p-7"}`}>
        <h3
          id={titleId}
          className={`font-display font-normal leading-[1.05] text-ink ${small ? "text-[24px]" : "text-[30px] xl:text-[38px]"}`}
        >
          {t(locale, tool.titleKey)}
        </h3>
        <span id={descId} className="block text-base leading-relaxed text-ink-2">
          {t(locale, tool.descKey)}
        </span>
        <span className="flex flex-wrap gap-2">
          {text.chips.map((chip) => (
            <span key={chip} className="rounded-pill bg-neutral-bg px-3 py-1.5 text-[13px] text-neutral-fg">
              {t(locale, chip)}
            </span>
          ))}
        </span>
        <span className="mt-auto flex pt-2.5">
          {selected ? (
            <span className="inline-flex min-h-12 items-center gap-2.5 rounded-button border border-ink px-5 text-[15px] font-medium text-ink">
              <Check aria-hidden className="size-[18px]" strokeWidth={1.8} /> {t(locale, "express.selected")}
            </span>
          ) : (
            <span className="inline-flex min-h-12 items-center gap-2.5 rounded-button bg-primary px-5 text-[15px] font-medium text-on-primary">
              {t(locale, text.cta)}
              <ArrowRight aria-hidden className="size-[18px]" strokeWidth={1.8} />
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
