"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getCapabilities, type Capabilities } from "../lib/api";
import { listingTextAccess, listingTextNeedsCapabilities, type ListingTextAccess } from "../lib/services";

/**
 * Om brukeren slipper inn i Annonsetekst (TG-NEW-281, T1). Reglene ligger i
 * listingTextAccess (lib/services.ts). GET /me sendes bare naar flagget er
 * "admin"; med "off" og "on" er svaret kjent med en gang, uten kall.
 */
export function useListingTextAccess(): ListingTextAccess {
  const { getToken } = useAuth();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const ask = listingTextNeedsCapabilities();

  useEffect(() => {
    if (!ask) return;
    let cancelled = false;
    void getCapabilities({ getToken }).then((c) => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, [ask, getToken]);

  return listingTextAccess(caps);
}
