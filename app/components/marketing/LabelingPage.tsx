import { ArrowRight, Check } from "lucide-react";
import { DISCLOSURE_DETAIL, DISCLOSURE_LOCALE, disclosureText } from "../../lib/disclosure";
import { DICTIONARIES } from "../../lib/i18n";
import { FAQ_PATH } from "../../lib/marketingAccess";
import type { FaqItem, Home, LabelingPage as LabelingPageContent, Site } from "../../../content/marketing/schema";
import { MarketingPicture } from "./MarketingPicture";
import { TextSection } from "./TextSection";
import { FOCUS } from "./classes";

/**
 * Merkesiden (MS5a). Ingenting staar to steder:
 * - bildet, eksempelet paa teksten til annonsen og guiden er home.labeling
 * - eksempelet lages med produktets funksjon (disclosureText), som paa forsiden
 * - lista over hva som kan vaere redigert er ordlista (codes.disclosureEdited),
 *   den samme appen bruker i teksten til annonsen
 * - lenketeksten til spoersmaalet er spoersmaalet selv (faq.ts)
 */
const SIZES = "(min-width: 880px) 800px, 100vw";

export function LabelingPage({
  page,
  home,
  faq,
  site,
}: {
  page: LabelingPageContent;
  home: Home;
  faq: readonly FaqItem[];
  site: Site;
}) {
  const { labeling } = home;
  const { example } = labeling;
  const disclosure = disclosureText(
    DISCLOSURE_LOCALE,
    {
      version: null,
      base: example.base,
      time: example.time,
      scope: null,
      edited: [...example.edited],
      source: null,
      status: "ok",
    },
    DISCLOSURE_DETAIL
  );
  const edited = Object.values(DICTIONARIES[DISCLOSURE_LOCALE].codes.disclosureEdited).map(
    (text) => text.charAt(0).toLocaleUpperCase(DISCLOSURE_LOCALE) + text.slice(1)
  );
  const question = faq.find((item) => item.id === page.rules.faqId);

  return (
    <>
      <TextSection section={page.mark} site={site}>
        <MarketingPicture
          picture={labeling.picture}
          sizes={SIZES}
          placeholderTitle={site.imagePlaceholder}
          pendingLabel={site.pendingLabels.image}
        />
      </TextSection>
      <TextSection section={page.adText} site={site}>
        {disclosure?.kind === "text" && (
          <figure className="m-0 flex flex-col gap-2 rounded-card border border-line bg-surface p-5 text-ink">
            <figcaption className="text-[13.5px] font-semibold text-ink-2">{example.title}</figcaption>
            <p className="m-0 text-[16px] leading-[1.5]">{disclosure.text}</p>
            <p className="m-0 text-[13.5px] text-ink-2">{example.note}</p>
          </figure>
        )}
      </TextSection>
      <TextSection section={page.list} site={site}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {edited.map((text) => (
            <li key={text} className="flex items-start gap-2.5 text-[16px] leading-[1.5] text-ink">
              <Check aria-hidden="true" className="mt-1 size-4 shrink-0" strokeWidth={2.4} />
              {text}
            </li>
          ))}
        </ul>
      </TextSection>
      <TextSection section={page.file} site={site} />
      <TextSection section={page.original} site={site} />
      <TextSection section={page.rules} site={site}>
        {question && (
          <a
            href={`${FAQ_PATH}#${question.id}`}
            className={`flex min-h-11 items-center gap-2 self-start rounded-button text-[16px] font-medium text-ink underline underline-offset-4 ${FOCUS}`}
          >
            {question.q}
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
          </a>
        )}
        <p className="m-0 text-[15px] font-medium text-ink-2">{labeling.guide.label}</p>
      </TextSection>
    </>
  );
}
