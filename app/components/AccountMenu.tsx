"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { Languages } from "lucide-react";
import { t, type Locale } from "../lib/i18n";
import { cookieLocale, localeCookie, parseLocale } from "../lib/i18n/locale";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Brukermenyen (Clerk UserButton) med spraakvalget (TG-NEW-129, valg 2).
 * Menyen viser det andre spraaket med sitt eget navn («English» naar appen
 * er norsk, «Norsk» naar den er engelsk), saa en som ikke forstaar spraaket
 * som vises, finner det.
 *
 * Valget skrives til cookien (visningen) og til Clerk unsafeMetadata
 * (foelger brukeren til andre enheter), og router.refresh() rendrer
 * rot-layouten paa nytt med riktig spraak og lang. Clerks egne tekster i
 * menyen er engelske til K1 (@clerk/localizations, egen PR).
 */
function writeCookie(locale: Locale): void {
  document.cookie = localeCookie(locale, window.location.protocol === "https:");
}

export function AccountMenu() {
  const locale = useLocale();
  const router = useRouter();
  const { isLoaded, user } = useUser();
  // Synken fra Clerk skjer en gang per sidelast, og aldri etter at brukeren
  // har valgt selv (ellers kunne en gammel verdi i Clerk overstyre valget).
  const settled = useRef(false);

  // Ny enhet: valget i Clerk vinner over cookien og nettleseren.
  useEffect(() => {
    if (!isLoaded || settled.current) return;
    settled.current = true;
    const saved = parseLocale(user?.unsafeMetadata?.locale);
    if (saved === null || saved === locale) return;
    if (cookieLocale(document.cookie) === saved) return;
    writeCookie(saved);
    router.refresh();
  }, [isLoaded, user, locale, router]);

  const next: Locale = locale === "nb" ? "en" : "nb";

  const choose = () => {
    settled.current = true;
    writeCookie(next);
    router.refresh();
    if (user) {
      // update erstatter hele unsafeMetadata, saa resten tas med. Feiler det,
      // gjelder valget likevel paa denne enheten (cookien).
      void user.update({ unsafeMetadata: { ...user.unsafeMetadata, locale: next } }).catch(() => undefined);
    }
  };

  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action
          label={t(next, "account.languageName")}
          labelIcon={<Languages aria-hidden className="size-4" strokeWidth={1.75} />}
          onClick={choose}
        />
      </UserButton.MenuItems>
    </UserButton>
  );
}
