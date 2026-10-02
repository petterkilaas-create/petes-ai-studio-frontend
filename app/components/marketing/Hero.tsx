import { ArrowRight, Check } from "lucide-react";
import { fill } from "../../../content/marketing/fill";
import { IMAGES } from "../../../content/marketing/images";
import type { Hero as HeroContent, Site } from "../../../content/marketing/schema";
import { HeroSlider } from "./HeroSlider";
import { CONTAINER, FOCUS } from "./classes";

/**
 * Toppen paa markedssiden (MS2, utkastet linje 47-73): overlinje,
 * overskrift, ingress, knappene, merknaden om gratisbilder og slideren.
 * Serverkomponent; bare slideren kjoerer i nettleseren. All tekst kommer
 * fra innholdet. «Prøv gratis» er site.cta (samme som i topplinjen), og
 * antallet gratisbilder er site.offer.freeImages.
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
            {hero.title}
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
              <a href={hero.secondary.href} className={`${BIG_BUTTON} border border-line-strong px-[22px] text-ink hover:bg-surface-2`}>
                {hero.secondary.label}
              </a>
            </div>
            <p className="m-0 flex items-center gap-2 text-[14.5px] text-ink-2">
              <Check aria-hidden="true" className="size-4 shrink-0 text-green-fg" strokeWidth={2.4} />
              {fill(hero.freeNote, { n: site.offer.freeImages })}
            </p>
          </div>
        </div>
        <figure className="m-0 flex min-w-0 flex-[2_1_560px] flex-col gap-3">
          <HeroSlider
            before={{ src: IMAGES[hero.before.image], alt: hero.before.alt }}
            after={{ src: IMAGES[hero.after.image], alt: hero.after.alt }}
            labels={hero.labels}
            sliderLabel={hero.sliderLabel}
            sliderValue={hero.sliderValue}
          />
          <figcaption className="text-[13.5px] leading-[1.5] text-ink-2">{hero.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
