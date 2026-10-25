"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  submitStylingOrder,
  SubmitError,
  type OrderJob,
  type Review,
  type StylingOrderParams,
} from "../lib/api";
import { useJobStatus, type UseJobStatusResult } from "../lib/useJobStatus";
import { OrderKeys } from "../lib/orderKey";
import type { QuotaEvent } from "../lib/quota";
import { orderPollDelayMs, orderStatus, pollJobId, STYLING_ORDER_SERVICE } from "../lib/styling";
import { deriveProcessStatus, isProcessingStatus, type ProcessStatus } from "./processStatus";

/** Ett kort per stil i bestillingen. */
export interface OrderCard {
  presetId: string;
  /** null for `not_started`: kortet vises uten polling. */
  jobId: string | null;
  notStarted: boolean;
  /** Hvorfor stilen ikke ble startet (capacity o.l.), ellers null. */
  notStartedCode: string | null;
  status: ProcessStatus;
  /** Den merkede previewUrl fra poll (Lekkasjen L2/L4), eller null. */
  imageUrl: string | null;
  review: Review | null;
  reviewerReason: string | null;
}

export interface UseOrderJobsResult {
  /** Samlet status for merket oeverst. */
  status: ProcessStatus;
  cards: OrderCard[];
  /** Koden fra en feilet bestilling, som i useProcessJob. */
  errorCode: string | null;
  errorReason: unknown;
  /** Bestillingen feilet foer jobbene (4xx/5xx eller nettverk). */
  failed: boolean;
  isProcessing: boolean;
  waking: boolean;
  run: (file: File, params: StylingOrderParams) => Promise<void>;
  reset: () => void;
}

export interface UseOrderJobsOptions {
  /** Kvoten fra bestillingen: 202 med `quota`, eller 402. */
  onQuota?: (event: QuotaEvent) => void;
}

/**
 * Bestilling av Digital styling med N jobber (S2-f): ett kall til
 * POST /v1/orders/styling, og hver startet stil polles som i dag
 * (useJobStatus). `not_started` har ingen jobb og polles ikke.
 *
 * useProcessJob har én jobId; her er det hoeyst tre (MAX_ORDER_JOBS, F1),
 * men backend godtar aatte til B1 er live, og reglene for hooks krever et
 * fast antall kall. Derfor aatte faste useJobStatus-kall, der en tom plass
 * faar null og ikke gjoer noe. Med mange kort poller hvert kort saktere
 * (orderPollDelayMs, S3-f).
 */
export function useOrderJobs(options: UseOrderJobsOptions = {}): UseOrderJobsResult {
  const { getToken } = useAuth();
  const { onQuota } = options;

  const [jobs, setJobs] = useState<OrderJob[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<unknown>(null);

  // Idempotency-Key: samme ved nytt forsoek og ved dobbeltklikk (valg 2A).
  const orderKeysRef = useRef<OrderKeys | null>(null);
  orderKeysRef.current ??= new OrderKeys();
  // Et klikk nr. to mens kallet gaar, sendes ikke (knappen er av foerst etter neste render).
  const inFlightRef = useRef(false);

  const pollOptions = { minDelayMs: orderPollDelayMs(jobs.length) };
  const polls: UseJobStatusResult[] = [
    useJobStatus(pollJobId(jobs[0]), pollOptions),
    useJobStatus(pollJobId(jobs[1]), pollOptions),
    useJobStatus(pollJobId(jobs[2]), pollOptions),
    useJobStatus(pollJobId(jobs[3]), pollOptions),
    useJobStatus(pollJobId(jobs[4]), pollOptions),
    useJobStatus(pollJobId(jobs[5]), pollOptions),
    useJobStatus(pollJobId(jobs[6]), pollOptions),
    useJobStatus(pollJobId(jobs[7]), pollOptions),
  ];

  const run = useCallback(
    async (file: File, params: StylingOrderParams) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setJobs([]);
      setFailed(false);
      setErrorCode(null);
      setErrorReason(null);
      setIsSubmitting(true);

      const orderKeys = orderKeysRef.current!;
      const idempotencyKey = orderKeys.keyFor({ file, service: STYLING_ORDER_SERVICE, params });

      try {
        const result = await submitStylingOrder({ image: file, params, idempotencyKey, getToken });
        // Mottatt (ogsaa duplicate: true): neste klikk er en ny bestilling.
        orderKeys.accepted();
        onQuota?.({ kind: "accepted", quota: result.quota });
        setJobs(result.jobs);
      } catch (err) {
        setFailed(true);
        if (err instanceof SubmitError) {
          setErrorCode(err.code);
          setErrorReason(err.detail.reason ?? null);
          if (err.code === "free_quota_exhausted") {
            onQuota?.({ kind: "exhausted", ...err.detail });
          }
        }
      } finally {
        inFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [getToken, onQuota]
  );

  const reset = useCallback(() => {
    setJobs([]);
    setFailed(false);
    setErrorCode(null);
    setErrorReason(null);
    setIsSubmitting(false);
    orderKeysRef.current?.clear();
  }, []);

  const cards: OrderCard[] = jobs.slice(0, polls.length).map((job, i) => {
    const jobId = pollJobId(job);
    const poll = polls[i];
    return {
      presetId: job.presetId,
      jobId,
      notStarted: jobId === null,
      notStartedCode: jobId === null ? job.code : null,
      status: jobId === null
        ? "idle"
        : deriveProcessStatus({ isSubmitting: false, submitError: null, syncResultUrl: null, jobId, jobStatus: poll.status }),
      imageUrl: jobId === null ? null : poll.imageUrl,
      review: jobId === null ? null : poll.review,
      reviewerReason: jobId === null ? null : poll.reviewerReason,
    };
  });

  const status = orderStatus({ isSubmitting, failed, cards });

  return {
    status,
    cards,
    errorCode,
    errorReason,
    failed,
    isProcessing: isProcessingStatus(status),
    waking: polls.some((p) => p.waking),
    run,
    reset,
  };
}
