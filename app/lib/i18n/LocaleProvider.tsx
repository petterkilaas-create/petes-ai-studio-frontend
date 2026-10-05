"use client";

import { createContext } from "react";
import type { Locale } from "./index";

/**
 * Spraaket rot-layouten for (app) fant (cookie, ellers nettleserens
 * Accept-Language), TG-NEW-129. useLocale leser det herfra. Utenfor
 * layouten (null) faller useLocale tilbake paa nettleseren.
 */
export const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}
