"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  submitJob,
  ValidationError,
  type ProcessParams,
  type Rejection,
  type Review,
} from "../lib/api";
import { useJobStatus } from "../lib/useJobStatus";
import {
  deriveProcessStatus,
  isProcessingStatus,
  type ProcessStatus,
} from "./processStatus";

export type { ProcessStatus } from "./processStatus";

/**
 * Samlet livssyklus for en /v1/process-jobb: submit -> (sync-blob | poll).
 *
 * Pakker submitJob + useJobStatus + ValidationError-gren + rejection bak
 * ett flatt grensesnitt, slik at PR 1/PR 2 kan bygge vilkaarlige
 * side-layouter oppaa samme logikk. Lib-laget (api.ts/useJobStatus.ts)
 * er uendret — dette er kun en orkestrerings-hook.
 *
 * Sync-svar (200) gir en blob direkte fra submitJob; vi lager og rydder
 * object-URL-en selv. Async-svar (202) gir en jobId som delegeres til
 * useJobStatus, som selv eier sin resultat-URL og polling.
 */
export interface UseProcessJobResult {
  status: ProcessStatus;
  /**
   * Resultatbildet: object-URL (sync-blob eller poll-bytes), eller signert
   * URL ved awaiting_approval.
   */
  resultUrl: string | null;
  /** Bruker-rettet feilmelding (ValidationError-detail eller poll-feil). */
  error: string | null;
  /** Strukturert scene-gate-avslag (TG-NEW-58), eller null. */
  rejection: Rejection | null;
  /** needs_review: code + reasons fra port 1, ellers null. */
  review: Review | null;
  /** Ved ukjent status: raa status og HTTP-kode, ellers null. */
  unknownDetail: string | null;
  /** Meglerens begrunnelse ved rejected_by_reviewer (2d-1), ellers null. */
  reviewerReason: string | null;
  /** Async-jobbens id (for lenken til /godkjenning), ellers null. */
  jobId: string | null;
  /** True mens vi laster opp eller poller. */
  isProcessing: boolean;
  run: (file: File, service: string, params?: ProcessParams) => Promise<void>;
  /**
   * "Fortsett som eksterioer"-flyten: kjoer forrige submit paa nytt med
   * scene_type="exterior" + force_scene_type=true, men behold alle andre
   * params fra originalkjoeringen — inkl. preset_id (kjent felle fra
   * Dag 19 PR #6: uten preset faller jobben tilbake til segmenterings-
   * stien og treffer aldri den generative gaten igjen).
   */
  resubmitForced: () => Promise<void>;
  reset: () => void;
}

interface LastRun {
  file: File;
  service: string;
  params?: ProcessParams;
}

export function useProcessJob(): UseProcessJobResult {
  const { getToken } = useAuth();

  const [jobId, setJobId] = useState<string | null>(null);
  const [syncResultUrl, setSyncResultUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Object-URL for sync-blob holdes i ref slik at vi kan revokere den
  // ved ny kjoering, reset og avmontering (poll-resultatet eier useJobStatus).
  const syncBlobUrlRef = useRef<string | null>(null);
  const lastRunRef = useRef<LastRun | null>(null);

  const job = useJobStatus(jobId);

  const revokeSyncUrl = useCallback(() => {
    if (syncBlobUrlRef.current) {
      URL.revokeObjectURL(syncBlobUrlRef.current);
      syncBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Rydd sync-URL ved avmontering.
    return () => revokeSyncUrl();
  }, [revokeSyncUrl]);

  const run = useCallback(
    async (file: File, service: string, params?: ProcessParams) => {
      revokeSyncUrl();
      setSyncResultUrl(null);
      setJobId(null);
      setSubmitError(null);
      lastRunRef.current = { file, service, params };
      setIsSubmitting(true);

      try {
        const result = await submitJob({ service, image: file, params, getToken });
        if (result.kind === "sync") {
          const url = URL.createObjectURL(result.imageBlob);
          syncBlobUrlRef.current = url;
          setSyncResultUrl(url);
        } else {
          setJobId(result.jobId);
        }
      } catch (err) {
        if (err instanceof ValidationError) {
          setSubmitError(`Ugyldige parametre: ${err.detail}`);
        } else {
          setSubmitError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [getToken, revokeSyncUrl]
  );

  const resubmitForced = useCallback(async () => {
    const last = lastRunRef.current;
    if (!last) return;
    await run(last.file, last.service, {
      ...last.params,
      scene_type: "exterior",
      force_scene_type: true,
    });
  }, [run]);

  const reset = useCallback(() => {
    revokeSyncUrl();
    setSyncResultUrl(null);
    setJobId(null);
    setSubmitError(null);
    setIsSubmitting(false);
    lastRunRef.current = null;
  }, [revokeSyncUrl]);

  const status: ProcessStatus = deriveProcessStatus({
    isSubmitting,
    submitError,
    syncResultUrl,
    jobId,
    jobStatus: job.status,
  });

  return {
    status,
    resultUrl: syncResultUrl ?? job.imageUrl,
    error: submitError ?? job.error,
    rejection: job.rejection,
    review: job.review,
    unknownDetail: job.unknownDetail,
    reviewerReason: job.reviewerReason,
    jobId,
    isProcessing: isProcessingStatus(status),
    run,
    resubmitForced,
    reset,
  };
}
