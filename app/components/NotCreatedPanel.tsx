"use client";

import { t, type UiKey } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Noeytralt panel for en jobb vi ikke laget (P3b, `not_created`): porten
 * fant at bildet ikke passer tjenesten. En avgjoerelse, ikke en feil: aldri
 * ErrorPanel. `lines` er grunnene og evt. gratisbildet (failedLines).
 */
export interface NotCreatedPanelProps {
  lines: readonly UiKey[];
}

export function NotCreatedPanel({ lines }: NotCreatedPanelProps) {
  const locale = useLocale();
  return (
    <div className="bg-neutral-bg text-neutral-fg rounded-button p-4 text-sm space-y-2" role="status">
      <p className="font-medium">{t(locale, "notCreated.title")}</p>
      {lines.map((key) => (
        <p key={key}>{t(locale, key)}</p>
      ))}
    </div>
  );
}
