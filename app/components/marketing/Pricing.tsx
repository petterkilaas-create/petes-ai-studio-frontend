import { Check } from "lucide-react";
import { fill } from "../../../content/marketing/fill";
import { formatNok, priceVars } from "../../../content/marketing/offer";
import type { Pricing as PricingContent, Site } from "../../../content/marketing/schema";
import { PendingMark } from "./PendingMark";
import { CONTAINER, FOCUS, H2, SECTION_Y } from "./classes";

/**
 * Prisene (MS3b, utkastet linje 287-339). Tallene kommer bare fra
 * site.offer, og «ca. … kr per bilde» regnes ut (offer.ts). Knappene gaar
 * dit «Prøv gratis» gaar (site.cta). F6a (designet Main.dc.html linje
 * 331-366): linja under kortene har tjenestene uten pris, med lappen [PRIS];
 * kjedene er en egen seksjon (Chains.tsx).
 */
const CARD = "flex flex-col gap-5 rounded-card border border-line bg-paper p-6";
const PRICE = "m-0 flex items-baseline gap-2 font-display text-[44px] leading-none text-ink";
const BUTTON = `mt-auto flex h-12 items-center justify-center rounded-button text-[15.5px] font-semibold no-underline ${FOCUS}`;

function Features({ items }: { items: readonly string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2 text-[15px] leading-[1.45] text-ink">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-green-fg" strokeWidth={2.4} />
          {f}
        </li>
      ))}
    </ul>
  );
}

export function Pricing({ pricing, site }: { pricing: PricingContent; site: Site }) {
  const { offer, cta } = site;
  const vars = priceVars(offer);
  const price = (amount: number) => fill(pricing.priceFormat, { price: formatNok(amount) });

  return (
    <section
      id={pricing.anchor}
      aria-labelledby={`${pricing.anchor}-tittel`}
      className={`border-t border-line bg-surface ${SECTION_Y}`}
    >
      <div className={`${CONTAINER} flex flex-col gap-10`}>
        <div className="flex flex-col gap-4">
          <h2 id={`${pricing.anchor}-tittel`} className={H2}>
            {pricing.title}
          </h2>
          <p className="m-0 text-[16px] text-ink-2">{pricing.note}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <article className={CARD}>
            <h3 className="m-0 text-[19px] font-semibold text-ink">{pricing.free.name}</h3>
            <p className={PRICE}>{price(offer.prices.free)}</p>
            <p className="m-0 text-[15px] leading-[1.5] text-ink-2">
              {fill(pricing.free.text, { n: offer.freeImages })}
            </p>
            <Features items={pricing.free.features} />
            <a href={cta.href} className={`${BUTTON} bg-primary text-on-primary hover:opacity-90`}>
              {cta.label}
            </a>
          </article>

          <article className={CARD}>
            <h3 className="m-0 text-[19px] font-semibold text-ink">{pricing.single.name}</h3>
            <p className={PRICE}>
              {price(offer.prices.single)}
              <span className="font-ui text-[15px] text-ink-2">{pricing.single.unit}</span>
            </p>
            <p className="m-0 text-[15px] leading-[1.5] text-ink-2">{pricing.single.text}</p>
            <Features items={pricing.single.features} />
            <a href={cta.href} className={`${BUTTON} border border-line-strong text-ink hover:bg-surface-2`}>
              {pricing.single.ctaLabel}
            </a>
          </article>

          <article className={`${CARD} border-ink`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-[19px] font-semibold text-ink">
                {fill(pricing.bundle.name, { n: offer.bundleCount })}
              </h3>
              <span className="rounded-pill bg-green-bg px-2.5 py-1 text-[12.5px] font-semibold text-green-fg">
                {pricing.bundle.badge}
              </span>
            </div>
            <p className={PRICE}>
              {price(offer.prices.bundle)}
              <span className="font-ui text-[15px] text-ink-2">{pricing.bundle.unit}</span>
            </p>
            <p className="m-0 text-[15px] leading-[1.5] text-ink-2">{fill(pricing.bundle.text, vars)}</p>
            <Features items={pricing.bundle.features} />
            <a href={cta.href} className={`${BUTTON} border border-line-strong text-ink hover:bg-surface-2`}>
              {pricing.bundle.ctaLabel}
            </a>
          </article>
        </div>

        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[15px] text-ink-2">
          {pricing.others.map((o) => (
            <li key={o.name}>
              {fill(pricing.otherFormat, { name: o.name })}
              <PendingMark label={site.pendingLabels[o.price.pending]} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
