"use client";

import type { Review } from "../lib/api";
import { messageText, t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";
import { jobMessage } from "../lib/jobMessage";

/**
 * Noeytralt panel for needs_review (2c-2): port 1 har stoppet jobben, og
 * det finnes ikke noe bilde. Bevisst ikke roedt (ErrorPanel) eller gult
 * (RejectionPanel). Megleren ser en kort melding ut fra `code` (TG-NEW-121).
 */
export interface ReviewPanelProps {
  review: Review;
}

export function ReviewPanel({ review }: ReviewPanelProps) {
  const locale = useLocale();
  const message = jobMessage("needs_review", review.code);
  return (
    <div className="bg-neutral-bg text-neutral-fg rounded-button p-4 text-sm space-y-2">
      <p className="font-medium">
        {t(locale, "status.awaitingApproval")}
      </p>
      {message && <p>{messageText(locale, message)}</p>}
    </div>
  );
}
