import { ArrowRight, Check, CirclePlay } from "lucide-react";
import { fill } from "../../../content/marketing/fill";
import type { Hero as HeroContent, Site } from "../../../content/marketing/schema";
import { HeroMosaic } from "./HeroMosaic";
import { CONTAINER, FOCUS } from "./classes";

/**
 * Toppen paa markedssiden (MS2, utkastet linje 47-73): overlinje,
 * overskrift, ingress, knappene, merknaden om gratisbilder og til hoeyre
 * mosaikken (F3, designet Main.dc.html linje 49-92; foer var det slideren,
 * som F5 bruker i foer/etter-fanene). Serverkomponent; bare videoloekka i
 * mosaikken kjoerer i nettleseren. All tekst kommer fra innholdet. «Prøv
 * gratis» er site.cta (samme som i topplinjen), og antallet gratisbilder er
 * site.offer.freeImages. Slutten av overskriften (titleEmphasis) er i kursiv.
 */
const BIG_BUTTON = `flex h-[54px] items-center rounded-[12px] text-[16.5px] font-semibold no-underline ${FOCUS}`;

export function Hero({ hero, site }: { hero: HeroContent; site: Site }) {
  return (
    <section id={hero.anchor} className="pb-[clamp(48px,7vw,96px)] pt-[clamp(36px,6vw,80px)]">
      <div className={`${CONTAINER} flex flex-wrap items-center gap-[clamp(32px,4.5vw,64px)]`}>
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
          <p className="m-0 flex items-center gap-2.5 text-[14.5px] font-medium text-ink-2">
            <span aria-hidden="true" className="size-2 rounded-full bg-amber-fg/70 ring-4 ring-amber-bg" />
            {hero.eyebrow}
          </p>
          <h1 className="m-0 text-balance font-display text-[clamp(46px,5.4vw,78px)] font-normal leading-none tracking-[-0.015em] text-ink">
            {hero.title} <em className="italic">{hero.titleEmphasis}</em>
          </h1>
          <p className="m-0 max-w-[32em] text-pretty text-[clamp(17px,1.35vw,19px)] leading-[1.55] text-ink-2">
            {hero.lead}
          </p>
          <div className="flex flex-col items-start gap-3.5 pt-1">
            <div className="flex flex-wrap gap-3">
              <a href={site.cta.href} className={`${BIG_BUTTON} gap-2.5 bg-primary px-6 text-on-primary hover:opacity-90`}>
                {site.cta.label}
                <ArrowRight aria-hidden="true" className="size-[18px]" strokeWidth={2} />
              </a>
              <a
                href={hero.secondary.href}
                className={`${BIG_BUTTON} gap-2.5 border border-line-strong bg-surface px-[22px] text-ink hover:bg-surface-2`}
              >
                <CirclePlay aria-hidden="true" className="size-5" strokeWidth={1.8} />
                {hero.secondary.label}
              </a>
            </div>
            <p className="m-0 flex items-center gap-2 text-[14.5px] text-ink-2">
              <Check aria-hidden="true" className="size-4 shrink-0 text-green-fg" strokeWidth={2.4} />
              {fill(hero.freeNote, { n: site.offer.freeImages })}
            </p>
          </div>
        </div>
        <HeroMosaic mosaic={hero.mosaic} />
      </div>
    </section>
  );
}
