"use client";

import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";
import { Pill } from "./ui/Pill";

/**
 * Merke for awaiting_approval (2c-2): bildet er laget, men ikke godkjent.
 * Vises sammen med resultatbildet — ikke en feil.
 */
export function ApprovalNotice() {
  const locale = useLocale();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Pill tone="amber">{t(locale, "status.awaitingApproval")}</Pill>
      <span className="text-[13px] text-ink-2">{t(locale, "approval.notApproved")}</span>
    </div>
  );
}
