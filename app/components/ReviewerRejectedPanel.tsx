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
    <div className="bg-neutral-bg text-neutral-fg rounded-button p-4 text-sm space-y-2">
      <p className="font-medium">
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
