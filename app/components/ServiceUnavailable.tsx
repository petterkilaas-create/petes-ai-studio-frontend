"use client";

import { ButtonLink } from "./ui/Button";
import { Card } from "./ui/Card";
import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Det en stengt side viser (TG-NEW-136, L0): en kort melding og lenke til
 * Express. Ingen kall mot backend, ingen jobber.
 */
export function ServiceUnavailable() {
  const locale = useLocale();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pt-16 md:px-8 md:pt-20">
      <Card padding="lg" className="w-full max-w-lg text-center">
        <p className="mb-2 text-lg font-medium text-ink">{t(locale, "unavailable.title")}</p>
        <p className="mb-8 text-sm text-ink-2">{t(locale, "unavailable.body")}</p>
        <ButtonLink href="/express">{t(locale, "unavailable.toExpress")}</ButtonLink>
      </Card>
    </main>
  );
}
