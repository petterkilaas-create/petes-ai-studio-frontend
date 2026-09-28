"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, pickLocale, type Locale } from "./index";

/**
 * Spraaket fra nettleseren (navigator.languages). Paa serveren og ved
 * foerste hydrering brukes DEFAULT_LOCALE (nb), saa en engelsk nettleser kan
 * et oeyeblikk se norsk. Spraakvelger og lagret valg: TG-NEW-129.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

function getSnapshot(): Locale {
  return pickLocale(navigator.languages);
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
