import type { PendingSlot } from "../../../content/marketing/fill";
import type { Site } from "../../../content/marketing/schema";
import { TemplateText } from "./TemplateText";

/** Tittelen (sidens eneste h1) og ingressen paa en innholdsside (MS5a). Ingressen er en mal. */
export function PageIntro({
  title,
  lead,
  vars,
  site,
}: {
  title: string;
  lead: string;
  vars: Record<string, string | number | PendingSlot>;
  site: Site;
}) {
  return (
    <header className="flex flex-col gap-4">
      <h1 className="m-0 text-balance font-display text-[clamp(40px,5vw,64px)] font-normal leading-[1.05] tracking-[-0.01em] text-ink">
        {title}
      </h1>
      <p className="m-0 max-w-[40em] text-pretty text-[18px] leading-[1.55] text-ink-2">
        <TemplateText template={lead} vars={vars} site={site} />
      </p>
    </header>
  );
}
