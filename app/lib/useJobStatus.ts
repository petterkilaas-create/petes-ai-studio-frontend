"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { pollJob, type Rejection, type Review } from "./api";
import { afterPoll, isTransientPollError, type JobStatus, type PollOutcome } from "./jobState";

export type { JobStatus } from "./jobState";

export interface UseJobStatusResult {
  status: JobStatus;
  imageUrl: string | null;
  /**
   * Bruker-rettet feilmelding. Ved gate-avslag (se `rejection`) er dette
   * meldingen UTEN rejected_*-prefiks — prefikset skal aldri vises i UI.
   */
  error: string | null;
  /**
   * Strukturert gate-avslag fra scene-type-gaten (TG-NEW-58), eller null
   * ved ekte pipeline-feil / ingen feil. UI kan bruke `reason` til aa
   * tilby "Fortsett som eksterioer"-flyt (resubmit med
   * scene_type="exterior" + force_scene_type=true).
   */
  rejection: Rejection | null;
  /** needs_review (2c-2): code + reasons fra port 1, ellers null. */
  review: Review | null;
  /** Meglerens begrunnelse ved rejected_by_reviewer (2d-1), ellers null. */
  reviewerReason: string | null;
  /** True mens pollingen venter etter en nettverksfeil eller 502-504 (TG-NEW-134). */
  waking: boolean;
}

export function useJobStatus(jobId: string | null): UseJobStatusResult {
  const { getToken } = useAuth();

  const [status, setStatus] = useState<JobStatus>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewerReason, setReviewerReason] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    setWaking(false);
    if (!jobId) {
      setStatus("idle");
      setImageUrl(null);
      setError(null);
      setRejection(null);
      setReview(null);
      setReviewerReason(null);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;

    setStatus("pending");
    setImageUrl(null);
    setError(null);
    setRejection(null);
    setReview(null);
    setReviewerReason(null);

    // setTimeout-basert scheduling (ikke setInterval) slik at neste poll
    // kan utsettes per svar: backend-styrt via Retry-After paa 202, eller
    // backoff etter nettverksfeil. Hindrer ogsaa overlappende ticks naar
    // et poll-kall tar lengre tid enn intervallet.
    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timeoutId = setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      let outcome: PollOutcome;
      try {
        outcome = { ok: true, result: await pollJob({ jobId, getToken }) };
      } catch (err) {
        outcome = { ok: false, error: err };
      }
      if (cancelled) return;

      const step = afterPoll(outcome, consecutiveErrors);
      // Rolig tekst bare ved kaldstart-feil, ikke ved 500 (TG-NEW-134).
      setWaking(step.kind === "wait" && isTransientPollError(outcome));
      if (step.kind === "wait") {
        // pending (Retry-After) eller backoff etter en feil.
        consecutiveErrors = step.consecutiveErrors;
        schedule(step.delayMs);
        return;
      }
      if (step.kind === "gave_up") {
        setError(step.error);
        setStatus("failed");
        return;
      }
      // Terminalt — ingen ny schedule, saa pollingen stopper.
      const next = step.state;
      setImageUrl(next.imageUrl);
      setError(next.error);
      setRejection(next.rejection);
      setReview(next.review);
      setReviewerReason(next.reviewerReason);
      setStatus(next.status);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [jobId, getToken]);

  return { status, imageUrl, error, rejection, review, reviewerReason, waking };
}
