"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getQuota } from "../lib/api";
import { applyQuotaEvent, type Quota, type QuotaEvent } from "../lib/quota";

export interface UseQuotaResult {
  /** null: ukjent (henter, 503 eller feil). Da vises ingen teller. */
  quota: Quota | null;
  /** Kvoten fra bestillingen (202 eller 402), se useProcessJob. */
  apply: (event: QuotaEvent) => void;
  /** Hent paa nytt, f.eks. naar en jobb ender failed (bildet kan vaere gitt tilbake). */
  refresh: () => void;
}

/**
 * Kvoten for gratisbilder (TG-NEW-149). Kilden er GET /v1/quota; tallet
 * oppdateres fra bestillingen. Et svar fra en henting som startet foer
 * siste oppdatering, forkastes, saa et gammelt tall aldri overskriver et nytt.
 */
export function useQuota(): UseQuotaResult {
  const { getToken } = useAuth();
  const [quota, setQuota] = useState<Quota | null>(null);
  const version = useRef(0);

  const refresh = useCallback(() => {
    const started = ++version.current;
    void getQuota({ getToken }).then((next) => {
      if (version.current === started && next !== null) setQuota(next);
    });
  }, [getToken]);

  const apply = useCallback((event: QuotaEvent) => {
    version.current += 1;
    setQuota((previous) => applyQuotaEvent(previous, event));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { quota, apply, refresh };
}
