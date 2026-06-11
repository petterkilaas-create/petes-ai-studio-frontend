"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { pollJob, type Rejection } from "./api";

export type JobStatus = "idle" | "pending" | "done" | "failed";

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

  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setStatus("idle");
      setImageUrl(null);
      setError(null);
      setRejection(null);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;

    setStatus("pending");
    setImageUrl(null);
    setError(null);
    setRejection(null);

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

        if (result.kind === "done") {
          const url = URL.createObjectURL(result.imageBlob);
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
          }
          objectUrlRef.current = url;
          setImageUrl(url);
          setStatus("done");
          return;
        }

        if (result.kind === "failed") {
          if (result.rejection) {
            setRejection(result.rejection);
            setError(result.rejection.message);
          } else {
            setError(result.detail);
          }
          setStatus("failed");
          return;
        }

        // pending — backend kan styre tempoet via Retry-After.
        schedule(result.retryAfterMs ?? POLL_INTERVAL_MS);
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

  return { status, imageUrl, error, rejection };
}
