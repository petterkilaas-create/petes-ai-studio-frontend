import { Check } from "lucide-react";
import { fill } from "../../../content/marketing/fill";
import { formatNok, priceVars } from "../../../content/marketing/offer";
import type { Pricing as PricingContent, Site } from "../../../content/marketing/schema";
import { CONTAINER, FOCUS, H2, SECTION_Y } from "./classes";

/**
 * Prisene (MS3b, utkastet linje 287-339) og kortet for kjeder og partnere
 * (#kjeder, kveldsblaatt). Tallene kommer bare fra site.offer, og «ca. … kr
 * per bilde» regnes ut (offer.ts). Knappene gaar dit «Prøv gratis» gaar
 * (site.cta).
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
  const { chains } = pricing;

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

        <p className="m-0 text-[15.5px] text-ink-2">
          {fill(pricing.addOn, { price: formatNok(offer.prices.privacyBlur) })}
        </p>

        <article
          id={chains.anchor}
          aria-labelledby={`${chains.anchor}-tittel`}
          className="flex flex-wrap items-center gap-x-[clamp(32px,5vw,64px)] gap-y-8 rounded-[20px] bg-night p-[clamp(28px,4vw,48px)] text-paper"
        >
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
            <p className="m-0 text-[14.5px] font-medium text-paper/80">{chains.eyebrow}</p>
            <h3 id={`${chains.anchor}-tittel`} className={`${H2} text-paper`}>
              {chains.title}
            </h3>
            <p className="m-0 text-[16.5px] leading-[1.55] text-paper/80">{chains.text}</p>
          </div>
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-6">
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {chains.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-[15.5px] leading-[1.45]">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
                  {p}
                </li>
              ))}
            </ul>
            <a href={chains.cta.href} className={`${BUTTON} self-start bg-paper px-6 text-ink hover:opacity-90`}>
              {chains.cta.label}
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}
