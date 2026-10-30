"use client";

import type { ReactNode } from "react";
import { useListingTextAccess } from "../../hooks/useListingTextAccess";
import { ServiceUnavailable } from "../ServiceUnavailable";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Vakten rundt sidene under /annonsetekst (TG-NEW-281, T1): innholdet bare
 * naar flagget slipper brukeren inn. Med "admin" vises en spinner til /me har
 * svart, og «midlertidig ikke tilgjengelig» uten view_all. Innholdet (og
 * kallene der) lages ikke foer svaret er ja.
 */
export function ListingTextGate({ children }: { children: ReactNode }) {
  const access = useListingTextAccess();
  const locale = useLocale();
  if (access === "no") return <ServiceUnavailable />;
  if (access === "pending") {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <div className="flex flex-col items-center justify-center py-24 gap-4" role="status">
          <div className="w-8 h-8 border-4 border-line border-t-ink rounded-full animate-spin motion-reduce:animate-none" />
          <p className="text-ink-2 text-sm">{t(locale, "listingText.page.loading")}</p>
        </div>
      </main>
    );
  }
  return children;
}
