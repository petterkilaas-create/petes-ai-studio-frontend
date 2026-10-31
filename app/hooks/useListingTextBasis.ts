"use client";

import { useEffect, useRef, useState } from "react";
import type { AssignmentRequest } from "../lib/assignments";
import { listingTextErrorCode, type ListingTextBasis } from "../lib/listingText";
import { fetchBasis } from "../lib/listingTextPackage";

export type BasisLoad =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; basis: ListingTextBasis | null }
  | { kind: "error"; code: string };

type BasisResult = { key: string } & ({ kind: "ok"; basis: ListingTextBasis | null } | { kind: "error"; code: string });

/**
 * Grunnlaget for tekstpakken (TG-NEW-281, T3; K §9.3 punkt 2): hentes én gang
 * med `include=basis` naar pakken er klar (`version` er satt), og paa nytt bare
 * naar versjonen endres eller «Prøv igjen» trykkes. Hentingen mens pakken
 * behandles (useListingText) er uten grunnlaget.
 *
 * Tilstanden lagres med noekkelen den gjelder (versjon og forsoek), saa
 * «Henter …» leses av noekkelen og ingen tilstand settes direkte i effekten.
 */
export function useListingTextBasis(
  assignmentId: string,
  request: AssignmentRequest,
  version: number | null
): { load: BasisLoad; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<BasisResult | null>(null);
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  const key = version === null ? null : `${assignmentId}:${version}:${attempt}`;

  useEffect(() => {
    if (key === null || version === null) return;
    let live = true;
    fetchBasis(requestRef.current, assignmentId, version).then(
      (basis) => {
        if (live) setResult({ key, kind: "ok", basis });
      },
      (err: unknown) => {
        if (live) setResult({ key, kind: "error", code: listingTextErrorCode(err) });
      }
    );
    return () => {
      live = false;
    };
  }, [assignmentId, version, key]);

  let load: BasisLoad;
  if (key === null) load = { kind: "idle" };
  else if (result === null || result.key !== key) load = { kind: "loading" };
  else load = result.kind === "ok" ? { kind: "ok", basis: result.basis } : { kind: "error", code: result.code };

  return { load, retry: () => setAttempt((n) => n + 1) };
}
