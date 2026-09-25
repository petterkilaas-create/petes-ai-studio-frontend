"use client";

import type { Review } from "../lib/api";

/**
 * Noeytralt panel for needs_review (2c-2): port 1 har stoppet jobben, og
 * det finnes ikke noe bilde. Bevisst ikke roedt (ErrorPanel) eller gult
 * (RejectionPanel). code/reasons vises raatt i liten tekst — siden er
 * intern inntil megler-teksten kommer.
 */
export interface ReviewPanelProps {
  review: Review;
}

export function ReviewPanel({ review }: ReviewPanelProps) {
  return (
    <div className="border border-slate-600 bg-slate-800/40 rounded-xl p-4 text-sm text-slate-200 space-y-2">
      <p className="font-black uppercase tracking-widest text-[10px]">
        Til gjennomgang
      </p>
      <p>Bildet må sjekkes før det kan lages.</p>
      {(review.code || review.reasons.length > 0) && (
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
