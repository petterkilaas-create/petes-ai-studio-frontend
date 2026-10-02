import type { MaybeLink, Services as ServicesContent, Site } from "../../../content/marketing/schema";
import { MarketingPicture } from "./MarketingPicture";
import { CONTAINER, FOCUS, H2, LEAD, SECTION_Y } from "./classes";

/**
 * Tjenestene (MS3, utkastet linje 192-240): de tilgjengelige som kort med
 * bilde, og de som kommer snart i en rad under. «Mer om …» er tekst til
 * tjenestesidene finnes (MS5); en lenke uten href vises aldri som lenke.
 */
const SIZES = "(min-width: 1320px) 620px, (min-width: 768px) 48vw, 100vw";

const BADGE = "inline-flex self-start rounded-pill px-2.5 py-1 text-[12.5px] font-semibold";

function More({ link }: { link: MaybeLink }) {
  if (link.href === undefined) return <span className="text-[15px] font-medium text-ink-2">{link.label}</span>;
  return (
    <a href={link.href} className={`rounded-button text-[15px] font-medium text-ink underline ${FOCUS}`}>
      {link.label}
    </a>
  );
}

export function Services({ services, site }: { services: ServicesContent; site: Site }) {
  const available = services.items.filter((s) => s.status === "available");
  const soon = services.items.filter((s) => s.status === "soon");
  return (
    <section id={services.anchor} aria-labelledby={`${services.anchor}-tittel`} className={SECTION_Y}>
      <div className={`${CONTAINER} flex flex-col gap-10`}>
        <div className="flex flex-col gap-4">
          <h2 id={`${services.anchor}-tittel`} className={H2}>
            {services.title}
          </h2>
          <p className={LEAD}>{services.lead}</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {available.map((s) => (
            <article key={s.id} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
              {s.picture && (
                <MarketingPicture
                  picture={s.picture}
                  sizes={SIZES}
                  placeholderTitle={site.imagePlaceholder}
                  pendingLabel={site.pendingLabels.image}
                />
              )}
              <span className={`${BADGE} bg-green-bg text-green-fg`}>{services.availableLabel}</span>
              <h3 className="m-0 text-[22px] font-semibold text-ink">{s.title}</h3>
              <p className="m-0 text-[15.5px] leading-[1.55] text-ink-2">{s.text}</p>
              {s.more && <More link={s.more} />}
            </article>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <span className={`${BADGE} bg-neutral-bg text-neutral-fg`}>{services.soonLabel}</span>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
            {soon.map((s) => (
              <li key={s.id} className="flex flex-col gap-1.5 rounded-card border border-line p-5">
                <h3 className="m-0 text-[17px] font-semibold text-ink">{s.title}</h3>
                <p className="m-0 text-[15px] leading-[1.5] text-ink-2">{s.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
