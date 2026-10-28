"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getFeedback, postFeedback } from "../../lib/api";
import {
  buildFeedback,
  EMPTY_DRAFT,
  FEEDBACK_TEXT_MAX,
  feedbackLength,
  feedbackTags,
  feedbackTooLong,
  TAG_KEYS,
  toggleTag,
  type FeedbackDraft,
} from "../../lib/feedback";
import { t, type Locale } from "../../lib/i18n";
import { buttonClass } from "../ui/Button";
import { cardClass } from "../ui/Card";
import { choiceClass, FOCUS } from "./classes";
import { StarRating } from "./StarRating";

const CARD = cardClass("md");
const BTN_PRIMARY = buttonClass("primary");
const BTN_SECONDARY = buttonClass("secondary");

/**
 * «Hvor fornøyd er du med bildet?» (Dag 58, Petter 28.10) under kortet etter
 * «Godkjenn» eller «Avvis», for eieren (feedbackMode "send"). Stjernene foerst; saa
 * «Hva kan bli bedre?» med knappene for tjenesten (feedbackTags), «Fortell
 * oss mer» (høyst 500 tegn, teller) og «Send». Etter 201 staar kvitteringen
 * med stjernene og «Endre tilbakemeldingen» (siste gjelder). Finnes en
 * tilbakemelding fra foer (GET), starter kortet med den. Frivillig: kortet
 * stopper aldri noe, og en feil gir bare en linje. Reglene ligger i lib/feedback.ts.
 *
 * `readOnly` (admin paa en annen brukers jobb, Petter 28.10): «Eierens
 * tilbakemelding» med stjernene, knappene og teksten, uten noe aa endre.
 * Har eieren ikke gitt noen, vises ingenting.
 */
export function FeedbackCard({
  jobId,
  readOnly = false,
  presetId,
  round,
  locale,
}: {
  jobId: string;
  /** Admin paa en annen brukers jobb: bare lesing (backend godtar bare eieren). */
  readOnly?: boolean;
  presetId: string | null;
  /** Runden som vurderes (feedbackRound), eller null. */
  round: number | null;
  locale: Locale;
}) {
  const { getToken } = useAuth();
  const titleId = useId();
  const betterId = useId();
  const textId = useId();
  const [draft, setDraft] = useState<FeedbackDraft>(EMPTY_DRAFT);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // Synkront vern mot dobbeltklikk; busy rekker ikke aa oppdatere mellom to raske klikk.
  const inFlight = useRef(false);
  // Har megleren begynt, overskriver ikke et sent svar fra GET det hen har valgt.
  const touched = useRef(false);
  const edit = (change: (prev: FeedbackDraft) => FeedbackDraft) => {
    touched.current = true;
    setDraft(change);
  };
  const allowed = feedbackTags(presetId);

  useEffect(() => {
    let cancelled = false;
    // Feiler hentingen, starter kortet tomt; en ny innsending blir den som gjelder.
    getFeedback({ jobId, getToken }).then(
      (previous) => {
        if (cancelled || previous === null || touched.current) return;
        setDraft({ rating: previous.rating, tags: previous.tags, text: previous.text });
        setSent(true);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [jobId, getToken]);

  const body = buildFeedback(draft, allowed, round);
  const tooLong = feedbackTooLong(draft.text);

  if (readOnly) {
    if (!sent) return null;
    return (
      <section className={`${CARD} flex flex-col gap-3`} aria-labelledby={titleId}>
        <p id={titleId} className="text-ink font-bold">
          {t(locale, "feedback.ownerTitle")}
        </p>
        {draft.rating !== null && <StarRating value={draft.rating} locale={locale} />}
        {draft.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {draft.tags.map((tag) => (
              <li key={tag} className="rounded-pill bg-neutral-bg px-3 py-1 text-[13px] text-neutral-fg">
                {t(locale, TAG_KEYS[tag])}
              </li>
            ))}
          </ul>
        )}
        {draft.text.trim() !== "" && (
          <p className="text-sm text-ink whitespace-pre-line break-words">{draft.text}</p>
        )}
      </section>
    );
  }

  const send = async () => {
    if (body === null || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await postFeedback({ jobId, body, getToken });
      if (result.kind === "ok") setSent(true);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <section className={`${CARD} flex flex-col gap-4`} aria-labelledby={titleId}>
        <p id={titleId} className="text-ink font-bold">
          {t(locale, "feedback.title")}
        </p>

        {sent ? (
          <>
            {draft.rating !== null && <StarRating value={draft.rating} locale={locale} />}
            <p className="text-sm text-ink" role="status">
              {t(locale, "feedback.thanks")}
            </p>
            <div>
              <button type="button" onClick={() => setSent(false)} className={BTN_SECONDARY}>
                {t(locale, "feedback.edit")}
              </button>
            </div>
          </>
        ) : (
          <>
            <StarRating
              value={draft.rating}
              onChange={(rating) => edit((prev) => ({ ...prev, rating }))}
              disabled={busy}
              labelledBy={titleId}
              locale={locale}
            />

            {draft.rating !== null && (
              <>
                <div className="flex flex-col gap-2">
                  <p id={betterId} className="text-sm font-medium text-ink">
                    {t(locale, "feedback.better")}
                  </p>
                  <div role="group" aria-labelledby={betterId} className="flex flex-wrap gap-2">
                    {allowed.map((tag) => {
                      const on = draft.tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => edit((prev) => ({ ...prev, tags: toggleTag(allowed, prev.tags, tag) }))}
                          disabled={busy}
                          aria-pressed={on}
                          className={choiceClass(on, "rounded-pill text-left break-words")}
                        >
                          {t(locale, TAG_KEYS[tag])}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor={textId} className="text-sm font-medium text-ink">
                    {t(locale, "feedback.more")}
                  </label>
                  <textarea
                    id={textId}
                    value={draft.text}
                    onChange={(e) => edit((prev) => ({ ...prev, text: e.target.value }))}
                    rows={3}
                    disabled={busy}
                    className={`w-full bg-surface border border-ink-2 rounded-button p-3 text-sm text-ink ${FOCUS}`}
                  />
                  <p className={`text-xs ${tooLong ? "text-red-fg" : "text-ink-2"}`}>
                    {tooLong
                      ? t(locale, "feedback.tooLong", { max: FEEDBACK_TEXT_MAX })
                      : t(locale, "feedback.count", { n: feedbackLength(draft.text), max: FEEDBACK_TEXT_MAX })}
                  </p>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={body === null || busy}
                    aria-busy={busy}
                    className={BTN_PRIMARY}
                  >
                    {t(locale, busy ? "feedback.sending" : "feedback.send")}
                  </button>
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-amber-fg bg-amber-bg rounded-button p-3" role="alert">
                {t(locale, "feedback.error")}
              </p>
            )}
          </>
        )}
      </section>
      <p className="text-xs text-ink-2 px-1">{t(locale, "feedback.privacy")}</p>
    </div>
  );
}
