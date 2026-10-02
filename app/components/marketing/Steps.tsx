import type { Steps as StepsContent } from "../../../content/marketing/schema";
import { CONTAINER, H2, SECTION_BAND, SECTION_Y } from "./classes";

/**
 * Tre steg (MS3, utkastet linje 169-186). Nummeret lages av rekkefoelgen i
 * en ordnet liste, saa det ikke staar som tekst i innholdet.
 */
export function Steps({ steps }: { steps: StepsContent }) {
  return (
    <section aria-labelledby="slik-tittel" className={`${SECTION_BAND} ${SECTION_Y}`}>
      <div className={`${CONTAINER} flex flex-col gap-10`}>
        <h2 id="slik-tittel" className={`${H2} max-w-[760px]`}>
          {steps.title}
        </h2>
        <ol className="m-0 grid list-none grid-cols-1 gap-8 p-0 md:grid-cols-3">
          {steps.items.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-full border border-line-strong font-display text-[20px] text-ink"
              >
                {i + 1}
              </span>
              <h3 className="m-0 text-[19px] font-semibold text-ink">{step.title}</h3>
              <p className="m-0 text-[15.5px] leading-[1.55] text-ink-2">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
