"use client";

import { useId, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getFeedback, postFeedback, type JobSummary } from "../lib/api";
import { changeRating, feedbackTags, historyRating, type FeedbackRating } from "../lib/feedback";
import { t, type Locale } from "../lib/i18n";
import { StarRating } from "./godkjenning/StarRating";

/**
 * Stjernene i Historikk (Dag 58, Petter 28.10): «Din vurdering» med stjernene
 * fra lista (`feedback_rating`, valg 1A), paa JobCard og per linje i
 * OrderCard. Eieren kan endre dem: siste innsending hentes (GET) og sendes
 * paa nytt med de nye stjernene (valg 3A, changeRating). Admin ser andres
 * stjerner bare for lesing, under «Eierens tilbakemelding». Ingen stjerner gitt: ingenting vises.
 */
export function HistoryStars({ job, locale }: { job: JobSummary; locale: Locale }) {
  const { getToken } = useAuth();
  const labelId = useId();
  const view = historyRating(job);
  // Stjernene etter en endring her; null gir verdien fra lista.
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  const inFlight = useRef(false);

  if (view === null) return null;
  const shown = rating ?? view.rating;

  const change = async (next: FeedbackRating) => {
    if (next === shown || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatus(null);
    try {
      const previous = await getFeedback({ jobId: job.jobId, getToken });
      const body = changeRating(previous, next, feedbackTags(job.presetId));
      const result = await postFeedback({ jobId: job.jobId, body, getToken });
      if (result.kind === "ok") {
        setRating(next);
        setStatus("saved");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-ink-2 text-[13px]">
        {t(locale, view.editable ? "feedback.yours" : "feedback.ownerTitle")}
      </span>
      {view.editable ? (
        <StarRating
          value={shown}
          onChange={(next) => void change(next)}
          disabled={busy}
          labelledBy={labelId}
          locale={locale}
        />
      ) : (
        <StarRating value={shown} locale={locale} />
      )}
      {status !== null && (
        <span className={`text-[13px] ${status === "error" ? "text-red-fg" : "text-ink-2"}`} role="status">
          {t(locale, status === "saved" ? "feedback.saved" : "feedback.error")}
        </span>
      )}
    </div>
  );
}
