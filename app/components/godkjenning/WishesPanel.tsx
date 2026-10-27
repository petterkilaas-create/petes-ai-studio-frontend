"use client";

import type { ReviewWishes } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { wishesView } from "../../lib/wishes";
import { cardClass } from "../ui/Card";
import { LABEL } from "./classes";

const CARD = cardClass("md");

/**
 * «Dine ønsker» (TG-NEW-263) i sidepanelet, under kortet med knappene, for
 * alle roller. Ønsket er meglerens egen tekst (React escaper den), bare for
 * eieren og foer A1; admin paa andres jobb ser bare svarene. Reglene ligger i
 * lib/wishes.ts. Svarene gjelder planen for moebleringen, ikke bildet.
 */
export function WishesPanel({
  wishes,
  status,
  isOwner,
  locale,
}: {
  wishes: ReviewWishes;
  status: string;
  isOwner: boolean;
  locale: Locale;
}) {
  const view = wishesView(wishes, { status, isOwner });
  return (
    <section className={`${CARD} flex flex-col gap-4`}>
      <p className={`${LABEL} mb-0`}>{t(locale, "wishes.title")}</p>
      {view.cleared && <p className="text-sm text-ink-2">{t(locale, "wishes.cleared")}</p>}
      {view.quote !== null && (
        <blockquote className="text-sm text-ink border-l-2 border-line-strong pl-3 whitespace-pre-line break-words">
          {view.quote}
        </blockquote>
      )}
      {view.rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {view.rows.map((row) => (
            <li key={row.no} className="text-sm">
              <p className="text-ink break-words">
                {row.text ?? t(locale, "wishes.numbered", { n: row.no })}
              </p>
              {row.answer !== null && <p className="text-ink font-medium">{t(locale, row.answer)}</p>}
              {row.reason !== null && <p className="text-ink-2">{t(locale, row.reason)}</p>}
            </li>
          ))}
        </ul>
      )}
      {view.summary !== null && (
        <div className="text-sm">
          <p className="text-ink font-medium">{t(locale, view.summary)}</p>
          {view.reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-ink-2">
              {view.reasons.map((key) => (
                <li key={key}>{t(locale, key)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {view.note !== null && <p className="text-sm text-ink">{t(locale, view.note)}</p>}
      {view.footnote && <p className="text-xs text-ink-2">{t(locale, "wishes.footnote")}</p>}
    </section>
  );
}
