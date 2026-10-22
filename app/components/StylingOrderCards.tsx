"use client";

import type { OrderCard } from "../hooks/useOrderJobs";
import { isProcessingStatus } from "../hooks/processStatus";
import { presetLabelKey } from "../lib/presets";
import { workingView } from "../lib/jobMedia";
import { outputView } from "../lib/jobState";
import { codeText, t, type Locale } from "../lib/i18n";
import { ApprovalNotice } from "./ApprovalNotice";
import { ErrorPanel } from "./ErrorPanel";
import { JobMedia } from "./JobMedia";
import { OpenReviewLink } from "./OpenReviewLink";
import { PreviewPlaceholder } from "./PreviewPlaceholder";
import { ReviewerRejectedPanel } from "./ReviewerRejectedPanel";
import { ReviewPanel } from "./ReviewPanel";
import { UnknownStatusPanel } from "./UnknownStatusPanel";
import { Card } from "./ui/Card";

const EMPTY_FRAME =
  "aspect-square w-full rounded-button border border-dashed border-line-strong flex items-center justify-center text-ink-2 text-sm p-4 text-center";

/**
 * Ett kort per stil i en bestilling av Digital styling (S2-f). En stil som
 * ikke ble startet (`not_started`), har ingen jobb og vises uten polling.
 * De andre viser det samme som kveldsbildet: ventebildet, det merkede
 * bildet og lenken til godkjenningen.
 */
export function StylingOrderCards({ cards, locale }: { cards: readonly OrderCard[]; locale: Locale }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => {
        const label = t(locale, presetLabelKey("scene_transform", card.presetId) ?? "service.virtual_stage");
        const output = outputView(card.status, card.imageUrl);
        return (
          <Card key={card.presetId} className="space-y-4">
            <p className="text-sm font-medium text-ink-2">{label}</p>
            {card.notStarted ? (
              <div className={EMPTY_FRAME}>{codeText(locale, "orderNotStarted", card.notStartedCode)}</div>
            ) : (
              <>
                {card.status === "awaiting_approval" && <ApprovalNotice />}
                {output.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={output.url} alt={label} className="w-full h-auto rounded-button border border-line" />
                ) : output.kind === "placeholder" ? (
                  <PreviewPlaceholder />
                ) : isProcessingStatus(card.status) ? (
                  <JobMedia
                    view={workingView("scene_transform", card.presetId)}
                    resultAlt={label}
                    aspect="square"
                    frame="rounded-button border border-dashed border-line-strong"
                    locale={locale}
                  />
                ) : (
                  <div className={EMPTY_FRAME}>{t(locale, "express.noResult")}</div>
                )}
                {card.status === "needs_review" && card.review && <ReviewPanel review={card.review} />}
                {(card.status === "awaiting_approval" || card.status === "needs_review") && card.jobId && (
                  <OpenReviewLink jobId={card.jobId} />
                )}
                {card.status === "rejected_by_reviewer" && <ReviewerRejectedPanel reason={card.reviewerReason} />}
                {card.status === "failed" && <ErrorPanel message={t(locale, "job.failed")} />}
                {card.status === "unknown" && <UnknownStatusPanel />}
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
