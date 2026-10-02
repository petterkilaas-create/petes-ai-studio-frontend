"use client";

import { useEffect, useRef } from "react";
import { startAutoRefresh, type RefreshResult } from "../lib/autoRefresh";

/**
 * Henter paa nytt med jevne mellomrom mens `active` er sann (se
 * lib/autoRefresh.ts for reglene). `resetKey` starter telleren paa nytt,
 * f.eks. etter «Oppdater» eller bytte av filter.
 */
export function useAutoRefresh(
  active: boolean,
  refresh: () => Promise<RefreshResult>,
  resetKey: number
): void {
  // Siste versjon av refresh uten at planleggeren startes paa nytt.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const control = startAutoRefresh({
      refresh: () => refreshRef.current(),
      hidden: () => document.visibilityState === "hidden",
      now: () => Date.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => window.clearTimeout(id as number),
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") control.visible();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      control.stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, resetKey]);
}
