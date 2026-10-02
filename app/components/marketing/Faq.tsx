import { ChevronDown } from "lucide-react";
import { priceVars } from "../../../content/marketing/offer";
import type { FaqBlock, FaqItem, Site } from "../../../content/marketing/schema";
import { PendingMark } from "./PendingMark";
import { TemplateText } from "./TemplateText";
import { CONTAINER, FOCUS, H2, SECTION_Y } from "./classes";

/**
 * Spoersmaal og svar (MS3b, utkastet linje 345-386) med innebygd
 * <details>/<summary>: virker med tastatur og uten JavaScript. Prisene i
 * svaret fylles fra site.offer, og det som venter, vises med merkelapp
 * ([E-POST], [TID], [JURIDISK SJEKK], [SVAR: …]).
 */
export function Faq({ block, items, site }: { block: FaqBlock; items: readonly FaqItem[]; site: Site }) {
  const vars = priceVars(site.offer);
  return (
    <section id={block.anchor} aria-labelledby={`${block.anchor}-tittel`} className={`${SECTION_Y} border-t border-line`}>
      <div className={`${CONTAINER} grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]`}>
        <div className="flex flex-col gap-4">
          <h2 id={`${block.anchor}-tittel`} className={H2}>
            {block.title}
          </h2>
          <p className="m-0 text-[16px] leading-[1.55] text-ink-2">
            <TemplateText template={block.lead} vars={{ email: site.contact.email }} site={site} />
          </p>
        </div>
        <div className="flex flex-col border-t border-line">
          {items.map((item) => (
            <details key={item.id} className="group border-b border-line">
              <summary
                className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-button py-4 text-[17px] font-semibold text-ink [&::-webkit-details-marker]:hidden ${FOCUS}`}
              >
                {item.q}
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 shrink-0 text-ink-2 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="m-0 pb-5 text-[16px] leading-[1.6] text-ink-2">
                {item.a !== null && <TemplateText template={item.a} vars={{ ...vars, ...item.slots }} site={site} />}
                {item.pending && <PendingMark label={site.pendingLabels[item.pending]} />}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
