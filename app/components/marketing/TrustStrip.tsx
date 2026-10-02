import { Check } from "lucide-react";
import type { Site, TrustStrip as TrustStripContent } from "../../../content/marketing/schema";
import { AI_CHIP, CONTAINER } from "./classes";
import { PendingMark } from "./PendingMark";

/**
 * Tillitsstripen under toppen (MS3, utkastet linje 76-81). Det foerste
 * punktet har AI-merket foran, de andre en hake. «Data lagret i EU» venter
 * paa bekreftet region og faar merkelappen.
 */
export function TrustStrip({ strip, site }: { strip: TrustStripContent; site: Site }) {
  return (
    <section aria-label={strip.label} className="border-y border-line bg-surface">
      <ul className={`${CONTAINER} m-0 flex list-none flex-wrap items-center justify-center gap-x-10 gap-y-3 py-5`}>
        {strip.items.map((item) => (
          <li key={item.text} className="flex items-center gap-2.5 text-[15px] font-medium text-ink">
            {item.ai ? (
              <span aria-hidden="true" className={AI_CHIP}>
                {strip.aiLabel}
              </span>
            ) : (
              <Check aria-hidden="true" className="size-4 shrink-0 text-green-fg" strokeWidth={2.4} />
            )}
            <span>
              {item.text}
              {item.pending && <PendingMark label={site.pendingLabels[item.pending]} />}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
