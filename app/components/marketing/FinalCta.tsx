import { ArrowRight } from "lucide-react";
import type { Brand } from "../../lib/brand";
import { fill } from "../../../content/marketing/fill";
import type { FinalCta as FinalCtaContent, Site } from "../../../content/marketing/schema";
import { CONTAINER, FOCUS } from "./classes";

/**
 * Siste knapp (MS3b, utkastet linje 392-398): «Prøv gratis» (site.cta) og
 * lenken for kjeder. F6b (designet Main.dc.html linje 392-402): lys
 * bakgrunn, saa den ikke staar moerk rett etter kjedene, og tittelen med
 * {brand} fra siden.
 */
export function FinalCta({ finalCta, site, brand }: { finalCta: FinalCtaContent; site: Site; brand: Brand }) {
  return (
    <section aria-labelledby="slutt-tittel" className="bg-surface-2 py-[clamp(64px,9vw,128px)] text-ink">
      <div className={`${CONTAINER} flex flex-col items-center gap-6 text-center`}>
        <h2
          id="slutt-tittel"
          className="m-0 max-w-[14em] text-balance font-display text-[clamp(42px,5.4vw,76px)] font-normal leading-none tracking-[-0.015em]"
        >
          {fill(finalCta.title, { brand: brand.displayName })}
        </h2>
        <p className="m-0 text-[17px] text-ink-2">{fill(finalCta.text, { n: site.offer.freeImages })}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
          <a
            href={site.cta.href}
            className={`flex h-[54px] items-center gap-2.5 rounded-[12px] bg-primary px-6 text-[16.5px] font-semibold text-on-primary no-underline hover:opacity-90 ${FOCUS}`}
          >
            {site.cta.label}
            <ArrowRight aria-hidden="true" className="size-[18px]" strokeWidth={2} />
          </a>
          <a
            href={finalCta.secondary.href}
            className={`flex min-h-11 items-center rounded-button text-[16px] font-medium text-ink underline underline-offset-4 ${FOCUS}`}
          >
            {finalCta.secondary.label}
          </a>
        </div>
      </div>
    </section>
  );
}
