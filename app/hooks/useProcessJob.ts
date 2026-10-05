"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  submitJob,
  SubmitError,
  type ProcessParams,
  type Rejection,
  type Review,
} from "../lib/api";
import { useJobStatus } from "../lib/useJobStatus";
import { OrderKeys } from "../lib/orderKey";
import type { QuotaEvent } from "../lib/quota";
import {
  deriveProcessStatus,
  isProcessingStatus,
  type ProcessStatus,
} from "./processStatus";

export type { ProcessStatus } from "./processStatus";

/**
 * Samlet livssyklus for en /v1/process-jobb: submit -> (sync-blob | poll).
 *
 * Pakker submitJob + useJobStatus + feilene + rejection bak
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
   * Resultatbildet: object-URL for sync-blob (privacy_blur), eller den
   * merkede previewUrl fra poll (Lekkasjen L2/L4). null gir plassholder.
   */
  imageUrl: string | null;
  /** Feilmelding fra bestillingen eller pollingen. Vises ikke paa Tjenester (TG-NEW-121). */
  error: string | null;
  /**
   * Koden fra en feilet bestilling (TG-NEW-149), f.eks. free_quota_exhausted.
   * Teksten hentes fra ordlista (orderError). null uten kode.
   */
  errorCode: string | null;
  /** Strukturert scene-gate-avslag (TG-NEW-58), eller null. */
  rejection: Rejection | null;
  /** needs_review: code + reasons fra port 1, ellers null. */
  review: Review | null;
  /** Meglerens begrunnelse ved rejected_by_reviewer (2d-1), ellers null. */
  reviewerReason: string | null;
  /** Async-jobbens id (for lenken til /godkjenning), ellers null. */
  jobId: string | null;
  /** True mens vi laster opp eller poller. */
  isProcessing: boolean;
  /** True mens pollingen venter ved kaldstart (TG-NEW-134). */
  waking: boolean;
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

export interface UseProcessJobOptions {
  /** Kvoten fra bestillingen: 202 med `quota`, eller 402 (TG-NEW-149). */
  onQuota?: (event: QuotaEvent) => void;
}

export function useProcessJob(options: UseProcessJobOptions = {}): UseProcessJobResult {
  const { getToken } = useAuth();
  const { onQuota } = options;

  const [jobId, setJobId] = useState<string | null>(null);
  const [syncResultUrl, setSyncResultUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);

  // Object-URL for sync-blob holdes i ref slik at vi kan revokere den
  // ved ny kjoering, reset og avmontering (poll-resultatet eier useJobStatus).
  const syncBlobUrlRef = useRef<string | null>(null);
  const lastRunRef = useRef<LastRun | null>(null);
  // Idempotency-Key: samme ved nytt forsoek av samme bestilling (valg 2A).
  const orderKeysRef = useRef<OrderKeys | null>(null);
  orderKeysRef.current ??= new OrderKeys();

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
      setSubmitErrorCode(null);
      lastRunRef.current = { file, service, params };
      setIsSubmitting(true);

      const orderKeys = orderKeysRef.current!;
      const idempotencyKey = orderKeys.keyFor({ file, service, params });

      try {
        const result = await submitJob({ service, image: file, params, idempotencyKey, getToken });
        // Mottatt (ogsaa duplicate: true): neste klikk er en ny bestilling.
        orderKeys.accepted();
        if (result.kind === "sync") {
          const url = URL.createObjectURL(result.imageBlob);
          syncBlobUrlRef.current = url;
          setSyncResultUrl(url);
        } else {
          onQuota?.({ kind: "accepted", quota: result.quota });
          setJobId(result.jobId);
        }
      } catch (err) {
        if (err instanceof SubmitError) {
          setSubmitError(err.message);
          setSubmitErrorCode(err.code);
          if (err.code === "free_quota_exhausted") {
            onQuota?.({ kind: "exhausted", ...err.detail });
          }
        } else {
          // Ogsaa ValidationError. Teksten vises ikke: Tjenester viser
          // orderError etter koden (TG-NEW-121).
          setSubmitError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [getToken, revokeSyncUrl, onQuota]
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
    setSubmitErrorCode(null);
    setIsSubmitting(false);
    lastRunRef.current = null;
    orderKeysRef.current?.clear();
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
    imageUrl: syncResultUrl ?? job.imageUrl,
    error: submitError ?? job.error,
    errorCode: submitErrorCode,
    rejection: job.rejection,
    review: job.review,
    reviewerReason: job.reviewerReason,
    jobId,
    isProcessing: isProcessingStatus(status),
    waking: job.waking,
    run,
    resubmitForced,
    reset,
  };
}
