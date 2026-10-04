"use client";

import { t, type Locale } from "../lib/i18n";
import type { QuotaView } from "../lib/quota";

/**
 * Telleren for gratisbilder ved bestillingen (TG-NEW-149), eller en rolig
 * melding naar de er brukt opp. Ikke en feil, derfor ikke roed. Tallene
 * kommer fra backend; ingen tekst eller antall er skrevet inn her.
 */
export function QuotaNotice({ view, locale }: { view: QuotaView; locale: Locale }) {
  if (view.kind === "hidden") return null;
  if (view.kind === "counter") {
    return (
      <p className="text-[13px] text-ink-2" role="status">
        {t(locale, "quota.counter", { remaining: view.remaining, limit: view.limit })}
      </p>
    );
  }
  return (
    <div className="rounded-button bg-surface-2 p-4 text-sm text-ink" role="status">
      {t(locale, "quota.exhausted", { limit: view.limit })}
    </div>
  );
}
