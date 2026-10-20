import { Check } from "lucide-react";
import type { Chains as ChainsContent } from "../../../content/marketing/schema";
import { CONTAINER, FOCUS, H2 } from "./classes";

/**
 * Kjeder og partnere (F6a, designet Main.dc.html linje 368-378): egen
 * seksjon etter prisene, paa ink med lys tekst. Teksten til venstre og
 * knappen til hoeyre fra md, under hverandre paa mobil. Ankeret er det samme
 * som foer (#kjeder), saa menyen og «Kjede eller partner?» virker.
 */
export function Chains({ chains }: { chains: ChainsContent }) {
  return (
    <section
      id={chains.anchor}
      aria-labelledby={`${chains.anchor}-tittel`}
      className="bg-ink py-[clamp(56px,6vw,80px)] text-paper"
    >
      <div
        className={`${CONTAINER} flex flex-col items-start gap-8 md:flex-row md:items-center md:justify-between md:gap-[clamp(32px,5vw,64px)]`}
      >
        <div className="flex min-w-0 max-w-[44em] flex-col gap-4">
          <p className="m-0 text-[14.5px] font-medium text-paper/80">{chains.eyebrow}</p>
          <h2 id={`${chains.anchor}-tittel`} className={`${H2} text-paper`}>
            {chains.title}
          </h2>
          <p className="m-0 text-pretty text-[17px] leading-[1.55] text-paper/80">{chains.text}</p>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {chains.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[15.5px] leading-[1.45]">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <a
          href={chains.cta.href}
          className={`flex h-[52px] shrink-0 items-center rounded-button bg-surface px-6 text-[16.5px] font-semibold text-ink no-underline hover:opacity-90 ${FOCUS}`}
        >
          {chains.cta.label}
        </a>
      </div>
    </section>
  );
}
