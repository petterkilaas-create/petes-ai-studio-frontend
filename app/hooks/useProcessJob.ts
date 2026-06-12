"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  submitJob,
  ValidationError,
  type ProcessParams,
  type Rejection,
} from "../lib/api";
import { useJobStatus } from "../lib/useJobStatus";

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
export type ProcessStatus = "idle" | "uploading" | "running" | "done" | "failed";

export interface UseProcessJobResult {
  status: ProcessStatus;
  /** Object-URL til resultatbildet (sync-blob eller poll-resultat). */
  resultUrl: string | null;
  /** Bruker-rettet feilmelding (ValidationError-detail eller poll-feil). */
  error: string | null;
  /** Strukturert scene-gate-avslag (TG-NEW-58), eller null. */
  rejection: Rejection | null;
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

  let status: ProcessStatus = "idle";
  if (isSubmitting) status = "uploading";
  else if (submitError) status = "failed";
  else if (syncResultUrl) status = "done";
  else if (jobId) {
    if (job.status === "failed") status = "failed";
    else if (job.status === "done") status = "done";
    else status = "running";
  }

  return {
    status,
    resultUrl: syncResultUrl ?? job.imageUrl,
    error: submitError ?? job.error,
    rejection: job.rejection,
    isProcessing: status === "uploading" || status === "running",
    run,
    resubmitForced,
    reset,
  };
}
