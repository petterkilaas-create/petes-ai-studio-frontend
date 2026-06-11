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
    setStatus("pending");
    setImageUrl(null);
    setError(null);
    setRejection(null);

    const tick = async () => {
      try {
        const result = await pollJob({ jobId, getToken });
        if (cancelled) return;

        if (result.kind === "done") {
          const url = URL.createObjectURL(result.imageBlob);
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
          }
          objectUrlRef.current = url;
          setImageUrl(url);
          setStatus("done");
          clearInterval(intervalId);
        } else if (result.kind === "failed") {
          if (result.rejection) {
            setRejection(result.rejection);
            setError(result.rejection.message);
          } else {
            setError(result.detail);
          }
          setStatus("failed");
          clearInterval(intervalId);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("failed");
        clearInterval(intervalId);
      }
    };

    const intervalId = setInterval(tick, POLL_INTERVAL_MS);
    void tick();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [jobId, getToken]);

  return { status, imageUrl, error, rejection };
}
