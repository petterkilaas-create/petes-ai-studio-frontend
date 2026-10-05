"use client";

import { useContext, useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, pickLocale, type Locale } from "./index";
import { LocaleContext } from "./LocaleProvider";

/**
 * Spraaket som vises (TG-NEW-129). I appen kommer det fra rot-layouten for
 * (app), som leser cookien `pas_locale` og nettleserens Accept-Language
 * (LocaleProvider), saa siden er paa riktig spraak fra foerste byte.
 *
 * Utenfor den layouten: nettleserens spraak (navigator.languages). Paa
 * serveren og ved foerste hydrering brukes da DEFAULT_LOCALE (nb).
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
  const fromLayout = useContext(LocaleContext);
  const fromBrowser = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return fromLayout ?? fromBrowser;
}
