import { ArrowRight } from "lucide-react";
import { MAX_IMAGES_PER_ASSIGNMENT } from "../../lib/assignments";
import { DICTIONARIES } from "../../lib/i18n";
import { DAILY_RUNS, LENGTH_TARGETS, MAX_DOCUMENT_BYTES, MAX_DOCUMENTS } from "../../lib/listingText";
import { MAX_LOCAL_EDITS } from "../../lib/local";
import { MAX_UPLOAD_BYTES } from "../../lib/uploadQueue";
import { fill } from "../../../content/marketing/fill";
import type { GuidePage as GuidePageContent } from "../../../content/marketing/schema";
import { H2_PAGE } from "./TextSection";
import { FOCUS } from "./classes";

/**
 * Veiledningen (Dag 59): innholdslista og en del per steg i ordren, med
 * nummererte steg og merknader under. Ingenting staar to steder:
 * - grensene er konstantene appen bruker (ordren, opplastingen, «Marker og beskriv»
 *   og Annonsetekst: dokumentene, pakkene per doegn og maalet for hovedteksten)
 * - statusnavnene er ordlista (assignment.status.*), de samme som paa bildesiden
 */
const VARS = {
  maxImages: MAX_IMAGES_PER_ASSIGNMENT,
  maxMb: MAX_UPLOAD_BYTES / (1024 * 1024),
  maxBoxes: MAX_LOCAL_EDITS,
  maxDocs: MAX_DOCUMENTS,
  docMb: MAX_DOCUMENT_BYTES / (1024 * 1024),
  dailyRuns: DAILY_RUNS,
  bodyMin: LENGTH_TARGETS["finn.body"][1],
  bodyMax: LENGTH_TARGETS["finn.body"][2],
};
const STATUS = DICTIONARIES.nb.ui;
const TEXT = "m-0 max-w-[40em] text-[17px] leading-[1.6] text-ink";
const LINK = `flex min-h-11 items-center gap-2 self-start rounded-button text-[16px] font-medium text-ink underline underline-offset-4 ${FOCUS}`;

export function GuidePage({ page }: { page: GuidePageContent }) {
  return (
    <>
      <nav aria-label={page.tocLabel}>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {page.sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className={LINK}>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {page.sections.map((section) => (
        <section key={section.id} id={section.id} className="flex scroll-mt-24 flex-col gap-4">
          <h2 className={H2_PAGE}>{section.title}</h2>
          {section.intro && <p className={TEXT}>{section.intro}</p>}
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-6 marker:font-semibold">
            {section.steps.map((step) => (
              <li key={step} className={`${TEXT} pl-1`}>
                {fill(step, VARS)}
              </li>
            ))}
          </ol>
          {section.statuses && (
            <dl className="m-0 flex flex-col gap-3">
              {section.statuses.map((s) => (
                <div key={s.status} className="flex flex-col gap-0.5">
                  <dt className="text-[17px] font-semibold text-ink">{STATUS[`assignment.status.${s.status}`]}</dt>
                  <dd className="m-0 max-w-[40em] text-[16px] leading-[1.6] text-ink-2">{s.text}</dd>
                </div>
              ))}
            </dl>
          )}
          {section.notes?.map((note) => (
            <p key={note} className="m-0 max-w-[40em] text-[16px] leading-[1.6] text-ink-2">
              {fill(note, VARS)}
            </p>
          ))}
          {section.more && (
            <a href={section.more.href} className={LINK}>
              {section.more.label}
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
            </a>
          )}
        </section>
      ))}
    </>
  );
}
