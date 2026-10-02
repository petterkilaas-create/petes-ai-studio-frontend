import { ArrowRight } from "lucide-react";
import { fill } from "../../../content/marketing/fill";
import type { FinalCta as FinalCtaContent, Site } from "../../../content/marketing/schema";
import { CONTAINER, FOCUS } from "./classes";

/** Siste knapp (MS3b, utkastet linje 392-398): «Prøv gratis» (site.cta) og lenken for kjeder. */
export function FinalCta({ finalCta, site }: { finalCta: FinalCtaContent; site: Site }) {
  return (
    <section aria-labelledby="slutt-tittel" className="bg-ink py-[clamp(64px,9vw,128px)] text-paper">
      <div className={`${CONTAINER} flex flex-col items-start gap-6`}>
        <h2
          id="slutt-tittel"
          className="m-0 max-w-[14em] text-balance font-display text-[clamp(42px,5.4vw,76px)] font-normal leading-none tracking-[-0.015em]"
        >
          {finalCta.title}
        </h2>
        <p className="m-0 text-[17px] text-paper/80">{fill(finalCta.text, { n: site.offer.freeImages })}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <a
            href={site.cta.href}
            className={`flex h-[54px] items-center gap-2.5 rounded-[12px] bg-paper px-6 text-[16.5px] font-semibold text-ink no-underline hover:opacity-90 ${FOCUS}`}
          >
            {site.cta.label}
            <ArrowRight aria-hidden="true" className="size-[18px]" strokeWidth={2} />
          </a>
          <a
            href={finalCta.secondary.href}
            className={`flex min-h-11 items-center rounded-button text-[16px] font-medium text-paper underline underline-offset-4 ${FOCUS}`}
          >
            {finalCta.secondary.label}
          </a>
        </div>
      </div>
    </section>
  );
}
