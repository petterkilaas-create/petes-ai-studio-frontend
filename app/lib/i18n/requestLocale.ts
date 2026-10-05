import { cookies, headers } from "next/headers";
import type { Locale } from "./index";
import { LOCALE_COOKIE, resolveLocale } from "./locale";

/**
 * Spraaket for forespoerselen paa serveren, etter samme regel som
 * rot-layouten for (app): cookien, ellers Accept-Language (TG-NEW-129).
 * Brukes av generateMetadata for fanetitlene. Bare for (app): markedssiden
 * skal forbli statisk og leser aldri cookien.
 */
export async function requestLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });
}
