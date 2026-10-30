"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssignmentRequest } from "../lib/assignments";
import { getListingText, listingTextErrorCode, type ListingText } from "../lib/listingText";
import type { RefreshResult } from "../lib/autoRefresh";

export type ListingTextLoad =
  | { kind: "loading" }
  | { kind: "ok"; pkg: ListingText }
  | { kind: "error"; code: string };

/**
 * Tekstpakken for ordren (TG-NEW-281, T2): GET …/listing-text uten
 * grunnlaget (K §9.3 punkt 2) ved start, og `reload` for hentingen hvert 4.
 * sekund mens pakken behandles (svaret gir `working` til useAutoRefresh).
 * `onLoaded` faar hver pakke som hentes (dokumentene til koeen). En henting
 * som feiler etter at pakken er vist, beholder siden som den er.
 * `setPackage` tar svaret fra bestillingen (202 gir hele pakken).
 */
export function useListingText(
  assignmentId: string,
  request: AssignmentRequest,
  onLoaded?: (pkg: ListingText) => void
): { load: ListingTextLoad; reload: () => Promise<RefreshResult>; setPackage: (pkg: ListingText) => void } {
  const [load, setLoad] = useState<ListingTextLoad>({ kind: "loading" });
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  const setPackage = useCallback((pkg: ListingText) => {
    onLoadedRef.current?.(pkg);
    setLoad({ kind: "ok", pkg });
  }, []);

  const reload = useCallback(async (): Promise<RefreshResult> => {
    try {
      const pkg = await getListingText(requestRef.current, assignmentId);
      setPackage(pkg);
      return { ok: true, working: pkg.displayStatus === "processing" };
    } catch (err) {
      const code = listingTextErrorCode(err);
      setLoad((prev) => (prev.kind === "ok" ? prev : { kind: "error", code }));
      return { ok: false, working: true };
    }
  }, [assignmentId, setPackage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { load, reload, setPackage };
}
