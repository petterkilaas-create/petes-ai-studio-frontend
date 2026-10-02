import type { Examples as ExamplesContent, Site } from "../../../content/marketing/schema";
import { ExampleTabs } from "./ExampleTabs";
import { CONTAINER, H2, LEAD, SECTION_Y } from "./classes";

/**
 * Eksemplene (MS3, utkastet linje 85-121): overskrift og ingress her
 * (serverkomponent), fanene i ExampleTabs (klientdel).
 */
export function Examples({ examples, site }: { examples: ExamplesContent; site: Site }) {
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
          labels={{
            tabList: examples.tabListLabel,
            before: examples.beforeCaption,
            after: examples.afterCaption,
            ai: examples.aiLabel,
          }}
          placeholderTitle={site.imagePlaceholder}
          pendingLabel={site.pendingLabels.image}
        />
      </div>
    </section>
  );
}
