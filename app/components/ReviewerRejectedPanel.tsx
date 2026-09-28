"use client";

import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Noeytralt panel for en jobb megleren selv har avvist (2d-1,
 * rejected_by_reviewer). En avgjoerelse, ikke en feil: aldri ErrorPanel.
 * Begrunnelsen er meglerens egen tekst og vises som tekst (React escaper).
 */
export interface ReviewerRejectedPanelProps {
  reason?: string | null;
}

export function ReviewerRejectedPanel({ reason }: ReviewerRejectedPanelProps) {
  const locale = useLocale();
  return (
    <div className="border border-slate-600 bg-slate-800/40 rounded-xl p-4 text-sm text-slate-200 space-y-2">
      <p className="font-black uppercase tracking-widest text-[10px]">
        {t(locale, "status.rejectedByYou")}
      </p>
      {reason && (
        <p className="break-words">
          {t(locale, "review.reasonLabel")}: {reason}
        </p>
      )}
    </div>
  );
}
