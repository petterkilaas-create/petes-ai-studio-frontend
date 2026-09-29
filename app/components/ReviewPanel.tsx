"use client";

import type { Review } from "../lib/api";
import { messageText } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";
import { jobMessage } from "../lib/jobMessage";

/**
 * Noeytralt panel for needs_review (2c-2): port 1 har stoppet jobben, og
 * det finnes ikke noe bilde. Bevisst ikke roedt (ErrorPanel) eller gult
 * (RejectionPanel). Megleren ser en kort melding ut fra `code` (TG-NEW-121).
 * Raa code/reasons vises bare med `debug` (/scene-transform-debug).
 */
export interface ReviewPanelProps {
  review: Review;
  /** Vis raa code og reasons under meldingen. Bare for debug-siden. */
  debug?: boolean;
}

export function ReviewPanel({ review, debug = false }: ReviewPanelProps) {
  const locale = useLocale();
  const message = jobMessage("needs_review", review.code);
  return (
    <div className="border border-slate-600 bg-slate-800/40 rounded-xl p-4 text-sm text-slate-200 space-y-2">
      <p className="font-black uppercase tracking-widest text-[10px]">
        Til gjennomgang
      </p>
      {message && <p>{messageText(locale, message)}</p>}
      {debug && (review.code || review.reasons.length > 0) && (
        <div className="text-[11px] text-slate-400 font-mono break-words space-y-0.5">
          {review.code && <p>code: {review.code}</p>}
          {review.reasons.map((reason, i) => (
            <p key={i}>- {reason}</p>
          ))}
        </div>
      )}
    </div>
  );
}
