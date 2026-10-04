import type { Site, TextSection as TextSectionContent } from "../../../content/marketing/schema";
import { PendingMark } from "./PendingMark";

/** Overskriften i en del av en innholdsside (h2 under sidens h1). */
export const H2_PAGE = "m-0 font-display text-[clamp(28px,3vw,36px)] font-normal leading-[1.1] text-ink";

/**
 * En del av en innholdsside (MS5a): overskrift, avsnitt (med merkelapp naar
 * noe venter) og det siden legger til under (bilde, eksempel, lenker).
 */
export function TextSection({
  section,
  site,
  children,
}: {
  section: TextSectionContent;
  site: Site;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className={H2_PAGE}>{section.title}</h2>
      {section.points.map((point) => (
        <p key={point.text} className="m-0 max-w-[40em] text-[17px] leading-[1.6] text-ink">
          {point.text}
          {point.pending && <PendingMark label={site.pendingLabels[point.pending]} />}
        </p>
      ))}
      {children}
    </section>
  );
}
