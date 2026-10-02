"use client";

import type { ReactNode } from "react";
import { REASON_MAX_LEN, type DecisionAction } from "../../lib/api";
import { codeText, t, type Locale } from "../../lib/i18n";
import {
  reasonLength,
  reasonTooLong,
  type DecisionControls,
  type FireplaceAnswer,
} from "../../lib/review";
import { buttonClass } from "../ui/Button";
import { cardClass } from "../ui/Card";
import { FOCUS } from "./classes";
import { FireplaceChoice } from "./FireplaceChoice";

const CARD = cardClass("md");
const BTN_PRIMARY = buttonClass("primary");
const BTN_SECONDARY = buttonClass("secondary");
const BTN_DANGER = buttonClass("danger");

/**
 * Handlingene i ett kort (D2b, brief §3 punkt 5 og §5): Godkjenn (primaer) ·
 * Korriger bildet (sekundaer) · Avvis (fare). Knappene styres bare av
 * `allowed_actions` (via decisionControls). «Korriger bildet» aapner
 * rettingen (`correction`) i samme kort. Avvisning med begrunnelse og
 * peisspoersmaalet for «Send videre» som foer.
 */
export function DecisionCard({
  reviewCode,
  controls,
  canCorrect,
  roundFailed,
  readOnly,
  locked,
  busy,
  approving,
  polling,
  answer,
  onAnswer,
  rejectOpen,
  onRejectOpen,
  reasonText,
  onReasonText,
  onDecide,
  onStartCorrection,
  correction,
  message,
  locale,
}: {
  /** Hvorfor jobben venter (gate_review, fireplace_answer_missing), som kode. */
  reviewCode: string | null;
  controls: DecisionControls;
  canCorrect: boolean;
  roundFailed: boolean;
  readOnly: boolean;
  locked: boolean;
  busy: boolean;
  /** Et approve-kall pågår (TG-NEW-147: kan ta noen sekunder). */
  approving: boolean;
  polling: boolean;
  answer: FireplaceAnswer;
  onAnswer: (answer: "yes" | "no") => void;
  rejectOpen: boolean;
  onRejectOpen: (open: boolean) => void;
  reasonText: string;
  onReasonText: (text: string) => void;
  onDecide: (action: DecisionAction) => void;
  onStartCorrection: () => void;
  /** CorrectionPanel naar brukeren retter, ellers null. */
  correction: ReactNode | null;
  message: string | null;
  locale: Locale;
}) {
  const tooLong = reasonTooLong(reasonText);
  return (
    <section className={`${CARD} flex flex-col gap-4`}>
      {roundFailed && (
        <p className="text-sm text-amber-fg bg-amber-bg rounded-button p-3" role="status">
          {t(locale, "correct.roundFailed")}
        </p>
      )}

      {correction !== null ? (
        correction
      ) : (
        <>
          {reviewCode !== null && <p className="text-sm text-ink">{codeText(locale, "reviewCode", reviewCode)}</p>}

          {controls.fireplaceQuestion && (
            <FireplaceChoice answer={answer} onChange={onAnswer} disabled={locked} locale={locale} />
          )}

          {controls.none ? (
            // Linja om bare lesing sier det samme lenger opp.
            !readOnly && <p className="text-sm text-ink-2">{t(locale, "action.noneAllowed")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {controls.approve && (
                <button
                  onClick={() => onDecide("approve")}
                  disabled={locked}
                  aria-busy={approving}
                  className={BTN_PRIMARY}
                >
                  {approving ? t(locale, "action.approving") : t(locale, "action.approve")}
                </button>
              )}
              {controls.continue && (
                <button
                  onClick={() => onDecide("continue")}
                  disabled={locked || !controls.continueEnabled}
                  className={BTN_PRIMARY}
                >
                  {t(locale, "action.continue")}
                </button>
              )}
              {canCorrect && (
                <button onClick={onStartCorrection} disabled={locked} className={BTN_SECONDARY}>
                  {t(locale, "action.correct")}
                </button>
              )}
              {controls.reject && !rejectOpen && (
                <button onClick={() => onRejectOpen(true)} disabled={locked} className={BTN_DANGER}>
                  {t(locale, "action.reject")}
                </button>
              )}
            </div>
          )}

          {controls.continue && <p className="text-xs text-ink-2">{t(locale, "action.newImage")}</p>}

          {controls.reject && rejectOpen && (
            <div className="flex flex-col gap-2">
              <textarea
                value={reasonText}
                onChange={(e) => onReasonText(e.target.value)}
                placeholder={t(locale, "action.reasonPlaceholder")}
                aria-label={t(locale, "action.reasonPlaceholder")}
                rows={3}
                disabled={locked}
                className={`w-full bg-surface border border-ink-2 rounded-button p-3 text-sm text-ink ${FOCUS}`}
              />
              <p className={`text-xs ${tooLong ? "text-red-fg" : "text-ink-2"}`}>
                {tooLong
                  ? t(locale, "action.reasonTooLong", { max: REASON_MAX_LEN })
                  : t(locale, "action.reasonCount", { n: reasonLength(reasonText), max: REASON_MAX_LEN })}
              </p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => onDecide("reject")} disabled={locked || tooLong} className={BTN_DANGER}>
                  {t(locale, "action.confirmReject")}
                </button>
                <button onClick={() => onRejectOpen(false)} disabled={locked} className={BTN_SECONDARY}>
                  {t(locale, "action.cancel")}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {message !== null && (
        <p className="text-sm text-amber-fg bg-amber-bg rounded-button p-3" role="status">
          {message}
        </p>
      )}

      {/* Under approve sier knappen selv «Godkjenner …». */}
      {(polling || (busy && !approving)) && (
        <p className="text-xs text-ink-2" role="status">
          {polling ? t(locale, "review.statusRunning") : t(locale, "action.working")}
        </p>
      )}
    </section>
  );
}
