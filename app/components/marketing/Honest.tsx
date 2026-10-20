import { Minus } from "lucide-react";
import type { Honest as HonestContent } from "../../../content/marketing/schema";
import { CONTAINER, LEAD } from "./classes";

/**
 * Den aerlige versjonen (MS3b, utkastet linje 272-282): det vi ikke gjoer.
 * F6a (Petter 20.10, A4 punkt 5): en kort blokk rett etter merkingen, med
 * mindre luft og en mindre tittel enn en vanlig seksjon, og punktene i to
 * kolonner fra md.
 */
export function Honest({ honest }: { honest: HonestContent }) {
  return (
    <section aria-labelledby="aerlig-tittel" className="py-[clamp(40px,5vw,64px)]">
      <div className={`${CONTAINER} flex flex-col gap-6`}>
        <div className="flex flex-col gap-2">
          <h2
            id="aerlig-tittel"
            className="m-0 text-balance font-display text-[clamp(28px,3vw,36px)] font-normal leading-[1.1] text-ink"
          >
            {honest.title}
          </h2>
          <p className={LEAD}>{honest.lead}</p>
        </div>
        <ul className="m-0 grid list-none grid-cols-1 gap-x-8 gap-y-3 p-0 md:grid-cols-2">
          {honest.points.map((point) => (
            <li key={point} className="flex items-start gap-3 border-b border-line pb-3 text-[16px] leading-[1.5] text-ink">
              <Minus aria-hidden="true" className="mt-1 size-4 shrink-0 text-ink-2" strokeWidth={2.4} />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
