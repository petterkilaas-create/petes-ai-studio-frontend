"use client";

import { useId, type ReactNode } from "react";
import { REASON_MAX_LEN, type AdditionsCheck, type DecisionAction } from "../../lib/api";
import { additionsSentences, additionsView, approveEnabled } from "../../lib/additions";
import { CHECKLISTS, comparedKey, type ChecklistId } from "../../lib/checklist";
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
 *
 * Kontrollen av tillegg (TG-NEW-199 PR 4): over sjekklista staar advarselen,
 * merknaden eller «Ikke kontrollert». Alt bare naar «Godkjenn» vises, og
 * ikke i rettingen.
 *
 * Sjekklista og krysset (D-5a, Petter 25.10): én liste per tjeneste
 * (`checklist`, null gir bare krysset), og ett kryss «Jeg har sammenlignet
 * …» som maa settes foer «Godkjenn» for alle nivaaer. Ved advarsel gjelder
 * krysset ogsaa de markerte stedene og setter `acknowledged`, som sendes
 * som foer.
 */
export function DecisionCard({
  reviewCode,
  reason,
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
  additions,
  checklist,
  compared,
  onCompared,
  acknowledged,
  onAcknowledged,
  message,
  locale,
}: {
  /** Hvorfor jobben venter (gate_review, fireplace_answer_missing), som kode. */
  reviewCode: string | null;
  /** TG-NEW-219: grunnen megleren ser, som kode. */
  reason: string | null;
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
  /** Kontrollen av tillegg for gjeldende runde. */
  additions: AdditionsCheck;
  /** Sjekklista for tjenesten; null (ukjent oppskrift) gir bare krysset. */
  checklist: ChecklistId | null;
  /** Krysset «Jeg har sammenlignet bildet med originalen.» */
  compared: boolean;
  onCompared: (on: boolean) => void;
  /** Ved advarsel: settes av samme kryss og sendes som `additions_acknowledged`. */
  acknowledged: boolean;
  onAcknowledged: (on: boolean) => void;
  message: string | null;
  locale: Locale;
}) {
  const tooLong = reasonTooLong(reasonText);
  const view = additionsView(additions.level);
  const sentences = additionsSentences(locale, additions);
  const checklistId = useId();
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
          {reason !== null && <p className="text-sm text-ink">{codeText(locale, "reasonCode", reason)}</p>}

          {controls.fireplaceQuestion && (
            <FireplaceChoice answer={answer} onChange={onAnswer} disabled={locked} locale={locale} />
          )}

          {/* TG-NEW-199 og D-5a: kontrollen, sjekklista og krysset. Bare naar «Godkjenn» vises. */}
          {controls.approve && (
            <div className="flex flex-col gap-3">
              {view.notice === "warning" && (
                <div className="flex flex-col gap-2 text-sm text-red-fg bg-red-bg rounded-button p-3 break-words" role="alert">
                  <p>{sentences.warning}</p>
                  {sentences.note !== null && <p>{sentences.note}</p>}
                </div>
              )}
              {view.notice === "note" && (
                <p className="text-sm text-amber-fg bg-amber-bg rounded-button p-3 break-words" role="status">
                  {sentences.note}
                </p>
              )}
              {view.notice === "unchecked" && (
                <p className="text-sm text-ink-2" role="status">
                  {t(locale, "additions.unchecked")}
                </p>
              )}
              {checklist !== null && (
                <div>
                  <p id={checklistId} className="text-sm font-medium text-ink">
                    {t(locale, "checklist.title")}
                  </p>
                  <ul aria-labelledby={checklistId} className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
                    {CHECKLISTS[checklist].map((key) => (
                      <li key={key}>{t(locale, key)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="flex items-start gap-3 min-h-11 cursor-pointer text-sm text-ink">
                <input
                  type="checkbox"
                  checked={compared}
                  disabled={locked}
                  onChange={(e) => {
                    onCompared(e.target.checked);
                    if (view.needsAck) onAcknowledged(e.target.checked);
                  }}
                  className={`w-5 h-5 mt-0.5 shrink-0 accent-primary ${FOCUS}`}
                />
                <span>{t(locale, comparedKey(additions.level))}</span>
              </label>
            </div>
          )}

          {controls.none ? (
            // Linja om bare lesing sier det samme lenger opp.
            !readOnly && <p className="text-sm text-ink-2">{t(locale, "action.noneAllowed")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {controls.approve && (
                <button
                  onClick={() => onDecide("approve")}
                  disabled={locked || !approveEnabled(additions.level, compared, acknowledged)}
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
