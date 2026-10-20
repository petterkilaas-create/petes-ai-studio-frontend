"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { tabKey } from "../../lib/tabs";
import { IMAGES } from "../../../content/marketing/images";
import type { Examples, Site } from "../../../content/marketing/schema";
import { HeroSlider } from "./HeroSlider";
import { PendingMark } from "./PendingMark";
import { TemplateText } from "./TemplateText";
import { FOCUS } from "./classes";

/**
 * Fanene i eksemplene (MS3), etter WAI-ARIA «Tabs» med automatisk valg:
 * role tablist/tab/tabpanel, aria-selected og aria-controls. Bare valgt fane
 * er med i tab-rekkefoelgen (roving tabindex). Piltastene bytter fane og
 * flytter fokus, Home og End gaar til foerste og siste (lib/tabs.ts).
 *
 * F5 (designet Main.dc.html linje 279-305): fanene er piller, og panelet
 * viser en slider (HeroSlider) med teksten under. key={tab.id} monterer
 * slideren paa nytt, saa skillet gaar tilbake til midten ved bytte av fane.
 * Panelet har ikke tabIndex, fordi haandtaket i slideren kan faa fokus.
 *
 * I smalt vindu kan fanene rulles sidelengs, uten det graa rullefeltet
 * (MS3b, Petter 02.10).
 */
export function ExampleTabs({
  tabs,
  labels,
  slider,
  brandName,
  site,
}: {
  tabs: Examples["tabs"];
  labels: { tabList: string; ai: string };
  slider: Examples["slider"];
  brandName: string;
  site: Site;
}) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const tab = tabs[active];

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = tabKey(active, e.key, tabs.length);
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label={labels.tabList}
        className="flex max-w-full gap-2 self-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={i === active}
            aria-controls={panelId}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
            className={`min-h-11 whitespace-nowrap rounded-pill border px-4 text-[15px] font-semibold ${FOCUS} ${
              i === active ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:bg-surface-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${baseId}-tab-${tab.id}`}
        className="flex flex-col gap-4"
      >
        <HeroSlider
          key={tab.id}
          before={{ src: IMAGES[tab.before.image], alt: tab.before.alt }}
          after={{ src: IMAGES[tab.after.image], alt: tab.after.alt }}
          labels={{ original: slider.original, result: tab.result, ai: labels.ai }}
          sliderLabel={slider.label}
          sliderValue={slider.value}
        />
        <p className="m-0 text-[14px] text-ink-2">
          <TemplateText template={tab.caption.text} vars={{ brand: brandName }} site={site} />
          {tab.caption.pending && <PendingMark label={site.pendingLabels[tab.caption.pending]} />}
        </p>
      </div>
    </div>
  );
}
