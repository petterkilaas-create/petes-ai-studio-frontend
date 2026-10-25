"use client";

import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { t, type Locale } from "../../lib/i18n";
import type { OrderTab } from "../../lib/orderTabs";
import { FOCUS } from "./classes";

/**
 * Fanene per bestilling (D-5c, TG-NEW-249, brett 6 i designet): én fane per
 * stil, med miniatyr, stilnavn og status. Fanene er lenker til jobbens egen
 * side, saa siden monteres paa nytt ved bytte, og krysset og alt annet per
 * jobb starter paa nytt. Paa mobil kan raden sveipes. Siden viser raden bare
 * med minst to jobber (orderTabs).
 */
export function OrderTabs({ tabs, locale }: { tabs: OrderTab[]; locale: Locale }) {
  return (
    <nav aria-label={t(locale, "review.orderTabs.label")}>
      <ul className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map((tab) => (
          <li key={tab.jobId} className="snap-start shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.current ? "page" : undefined}
              className={`flex min-h-11 w-56 items-center gap-3 rounded-button border p-2 transition-colors ${FOCUS} ${
                tab.current
                  ? "border-primary bg-surface-2"
                  : "border-line-strong bg-surface hover:bg-surface-2"
              }`}
            >
              <span className="relative block h-10 w-15 shrink-0 overflow-hidden rounded-button bg-surface-2">
                {tab.thumbUrl !== null ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tab.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <ImageIcon aria-hidden="true" className="h-5 w-5 text-ink-2" />
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={`truncate text-sm text-ink ${tab.current ? "font-medium" : ""}`}>{tab.label}</span>
                <span className="truncate text-[13px] text-ink-2">{t(locale, tab.statusKey)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
