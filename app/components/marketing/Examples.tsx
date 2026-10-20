import type { Brand } from "../../lib/brand";
import type { Examples as ExamplesContent, Site } from "../../../content/marketing/schema";
import { ExampleTabs } from "./ExampleTabs";
import { CONTAINER, H2, LEAD, SECTION_Y } from "./classes";

/**
 * Foer og etter (MS3; F5, designet Main.dc.html linje 279-305): overskrift og
 * ingress her (serverkomponent), fanene med slideren i ExampleTabs
 * (klientdel). Merkenavnet til {brand} kommer fra siden.
 */
export function Examples({ examples, site, brand }: { examples: ExamplesContent; site: Site; brand: Brand }) {
  return (
    <section id={examples.anchor} aria-labelledby={`${examples.anchor}-tittel`} className={SECTION_Y}>
      <div className={`${CONTAINER} flex flex-col gap-8`}>
        <div className="flex flex-col gap-4">
          <h2 id={`${examples.anchor}-tittel`} className={H2}>
            {examples.title}
          </h2>
          <p className={LEAD}>{examples.lead}</p>
        </div>
        <ExampleTabs
          tabs={examples.tabs}
          labels={{ tabList: examples.tabListLabel, ai: examples.aiLabel }}
          slider={examples.slider}
          brandName={brand.displayName}
          site={site}
        />
      </div>
    </section>
  );
}
