"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { pollJob, type Rejection, type Review } from "./api";
import { terminalState, type JobStatus } from "./jobState";

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
  /** Ved ukjent status: raa status og HTTP-kode, ellers null. */
  unknownDetail: string | null;
}

const POLL_INTERVAL_MS = 2000;

// Transient nettverksfeil dreper ikke loopen umiddelbart: vi proever paa
// nytt med eksponentiell backoff (2 s, 4 s) og gir foerst opp ved tredje
// paafoelgende feil. Et vellykket poll nullstiller telleren.
const MAX_CONSECUTIVE_ERRORS = 3;
const BACKOFF_BASE_MS = 2000;

export function useJobStatus(jobId: string | null): UseJobStatusResult {
  const { getToken } = useAuth();

  const [status, setStatus] = useState<JobStatus>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [unknownDetail, setUnknownDetail] = useState<string | null>(null);

  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setStatus("idle");
      setImageUrl(null);
      setError(null);
      setRejection(null);
      setReview(null);
      setUnknownDetail(null);
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
    setUnknownDetail(null);

    // setTimeout-basert scheduling (ikke setInterval) slik at neste poll
    // kan utsettes per svar: backend-styrt via Retry-After paa 202, eller
    // backoff etter nettverksfeil. Hindrer ogsaa overlappende ticks naar
    // et poll-kall tar lengre tid enn intervallet.
    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timeoutId = setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      try {
        const result = await pollJob({ jobId, getToken });
        if (cancelled) return;
        consecutiveErrors = 0;

        // Alt unntatt pending er terminalt (ogsaa ukjent status) — ingen
        // ny schedule, saa pollingen stopper.
        const next = terminalState(result, (blob) => {
          const url = URL.createObjectURL(blob);
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
          }
          objectUrlRef.current = url;
          return url;
        });
        if (next !== null) {
          setImageUrl(next.imageUrl);
          setError(next.error);
          setRejection(next.rejection);
          setReview(next.review);
          setUnknownDetail(next.unknownDetail);
          setStatus(next.status);
          return;
        }

        // pending — backend kan styre tempoet via Retry-After.
        if (result.kind === "pending") {
          schedule(result.retryAfterMs ?? POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        consecutiveErrors += 1;

        if (consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
          // 1. feil -> vent 2 s, 2. feil -> vent 4 s.
          schedule(BACKOFF_BASE_MS * 2 ** (consecutiveErrors - 1));
          return;
        }

        setError(err instanceof Error ? err.message : String(err));
        setStatus("failed");
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [jobId, getToken]);

  return { status, imageUrl, error, rejection, review, unknownDetail };
}
