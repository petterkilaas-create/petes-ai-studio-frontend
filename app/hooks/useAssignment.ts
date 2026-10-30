"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { assignmentRequest } from "../lib/api";
import { assignmentErrorCode, getAssignment, type Assignment, type AssignmentRequest } from "../lib/assignments";
import { isProcessing } from "../lib/ordrer";
import type { RefreshResult } from "../lib/autoRefresh";

export type AssignmentLoad =
  | { kind: "loading" }
  | { kind: "ok"; assignment: Assignment }
  | { kind: "not_found" }
  | { kind: "error"; code: string };

/**
 * Ordren for brettet og oppsummeringen (FE-3): én henting av K 2.3 ved
 * start, og `reload` for «Prøv igjen». `onLoaded` kalles med ordren etter
 * hentingen (utkastet leses der, ikke i en effekt). `request` er kallet mot
 * backend med token (assignmentRequest), til bestillingen.
 *
 * FE-4: `reload` gir svaret til useAutoRefresh (ordresiden henter paa nytt
 * mens noe behandles). En henting som feiler etter at ordren er vist,
 * beholder siden som den er (som bildesiden).
 */
export function useAssignment(
  assignmentId: string,
  onLoaded?: (assignment: Assignment) => void
): { load: AssignmentLoad; reload: () => Promise<RefreshResult>; request: AssignmentRequest } {
  const { getToken } = useAuth();
  const request = useMemo(() => assignmentRequest(getToken), [getToken]);
  const [load, setLoad] = useState<AssignmentLoad>({ kind: "loading" });
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  const reload = useCallback(async (): Promise<RefreshResult> => {
    try {
      const assignment = await getAssignment(requestRef.current, assignmentId);
      onLoadedRef.current?.(assignment);
      setLoad({ kind: "ok", assignment });
      return { ok: true, working: isProcessing(assignment) };
    } catch (err) {
      const code = assignmentErrorCode(err);
      setLoad((prev) =>
        prev.kind === "ok" ? prev : code === "not_found" ? { kind: "not_found" } : { kind: "error", code }
      );
      return { ok: false, working: true };
    }
  }, [assignmentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { load, reload, request };
}
