import { ArrowRight } from "lucide-react";
import type { FaqBlock, FaqItem, Site } from "../../../content/marketing/schema";
import { FaqList } from "./FaqList";
import { TemplateText } from "./TemplateText";
import { CONTAINER, FOCUS, H2, SECTION_Y } from "./classes";

/**
 * Spoersmaal og svar paa forsiden (MS3b, utkastet linje 345-386): de med
 * showOnHome. MS5a: lista er FaqList, og «Se alle spørsmål» gaar til
 * spoersmaalssiden.
 */
export function Faq({ block, items, site }: { block: FaqBlock; items: readonly FaqItem[]; site: Site }) {
  return (
    <section id={block.anchor} aria-labelledby={`${block.anchor}-tittel`} className={`${SECTION_Y} border-t border-line`}>
      <div className={`${CONTAINER} grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]`}>
        <div className="flex flex-col items-start gap-4">
          <h2 id={`${block.anchor}-tittel`} className={H2}>
            {block.title}
          </h2>
          <p className="m-0 text-[16px] leading-[1.55] text-ink-2">
            <TemplateText template={block.lead} vars={{ email: site.contact.email }} site={site} />
          </p>
          <a
            href={block.more.href}
            className={`flex min-h-11 items-center gap-2 rounded-button text-[16px] font-medium text-ink underline underline-offset-4 ${FOCUS}`}
          >
            {block.more.label}
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2} />
          </a>
        </div>
        <FaqList items={items} site={site} />
      </div>
    </section>
  );
}
