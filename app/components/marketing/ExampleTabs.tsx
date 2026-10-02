"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { tabKey } from "../../lib/tabs";
import type { Examples } from "../../../content/marketing/schema";
import { MarketingPicture } from "./MarketingPicture";
import { AI_CHIP, FOCUS } from "./classes";

/**
 * Fanene i eksemplene (MS3), etter WAI-ARIA «Tabs» med automatisk valg:
 * role tablist/tab/tabpanel, aria-selected og aria-controls. Bare valgt fane
 * er med i tab-rekkefoelgen (roving tabindex). Piltastene bytter fane og
 * flytter fokus, Home og End gaar til foerste og siste (lib/tabs.ts).
 * Bildene lastes lat; bare toppbildet har hoey prioritet.
 *
 * I smalt vindu kan fanene rulles sidelengs, uten det graa rullefeltet
 * (MS3b, Petter 02.10).
 */
const SIZES = "(min-width: 1320px) 620px, (min-width: 640px) 48vw, 100vw";

export function ExampleTabs({
  tabs,
  labels,
  placeholderTitle,
  pendingLabel,
}: {
  tabs: Examples["tabs"];
  labels: { tabList: string; before: string; after: string; ai: string };
  placeholderTitle: string;
  pendingLabel: string;
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
        className="flex max-w-full gap-1 self-start overflow-x-auto rounded-[12px] bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
            className={`min-h-11 whitespace-nowrap rounded-[9px] px-4 text-[15px] font-semibold ${FOCUS} ${
              i === active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"
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
        tabIndex={0}
        className={`grid grid-cols-1 gap-5 rounded-[14px] sm:grid-cols-2 ${FOCUS}`}
      >
        <figure className="m-0 flex flex-col gap-2.5">
          <MarketingPicture
            picture={tab.before}
            sizes={SIZES}
            placeholderTitle={placeholderTitle}
            pendingLabel={pendingLabel}
          />
          <figcaption className="text-[14px] text-ink-2">{labels.before}</figcaption>
        </figure>
        <figure className="m-0 flex flex-col gap-2.5">
          <MarketingPicture
            picture={tab.after}
            sizes={SIZES}
            placeholderTitle={placeholderTitle}
            pendingLabel={pendingLabel}
          />
          <figcaption className="flex items-center gap-2 text-[14px] text-ink-2">
            <span aria-hidden="true" className={AI_CHIP}>
              {labels.ai}
            </span>
            {labels.after}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
