import { Minus } from "lucide-react";
import type { Honest as HonestContent } from "../../../content/marketing/schema";
import { CONTAINER, H2, LEAD, SECTION_Y } from "./classes";

/** Den aerlige versjonen (MS3b, utkastet linje 272-282): det vi ikke gjoer. */
export function Honest({ honest }: { honest: HonestContent }) {
  return (
    <section aria-labelledby="aerlig-tittel" className={SECTION_Y}>
      <div className={`${CONTAINER} grid grid-cols-1 gap-8 lg:grid-cols-2`}>
        <div className="flex flex-col gap-4">
          <h2 id="aerlig-tittel" className={H2}>
            {honest.title}
          </h2>
          <p className={LEAD}>{honest.lead}</p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {honest.points.map((point) => (
            <li key={point} className="flex items-start gap-3 border-b border-line pb-4 text-[16px] leading-[1.5] text-ink">
              <Minus aria-hidden="true" className="mt-1 size-4 shrink-0 text-ink-2" strokeWidth={2.4} />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
