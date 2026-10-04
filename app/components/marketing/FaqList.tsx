import { ChevronDown } from "lucide-react";
import { priceVars } from "../../../content/marketing/offer";
import type { FaqItem, Site } from "../../../content/marketing/schema";
import { PendingMark } from "./PendingMark";
import { TemplateText } from "./TemplateText";
import { FOCUS } from "./classes";

/**
 * Spoersmaalene (MS3b, skilt ut i MS5a) med innebygd <details>/<summary>:
 * virker med tastatur og uten JavaScript. Brukes paa forsiden (showOnHome)
 * og paa spoersmaalssiden (alle). `id` er spoersmaalets id, saa merkesiden
 * kan lenke til et spoersmaal. Prisene i svaret fylles fra site.offer, og
 * det som venter, vises med merkelapp ([E-POST], [TID], [JURIDISK SJEKK], [SVAR: …]).
 */
export function FaqList({ items, site }: { items: readonly FaqItem[]; site: Site }) {
  const vars = priceVars(site.offer);
  return (
    <div className="flex flex-col border-t border-line">
      {items.map((item) => (
        <details key={item.id} id={item.id} className="group scroll-mt-24 border-b border-line">
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
  );
}
