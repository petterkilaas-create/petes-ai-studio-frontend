"use client";

import Link from "next/link";
import type { AssignmentLoad } from "../../hooks/useAssignment";
import { ORDERS_PATH } from "../../lib/services";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FOCUS } from "../godkjenning/classes";
import { codeText, t, type UiKey } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Henter, fant ikke ordren eller feil (brettet og oppsummeringen, FE-3; som
 * bildesiden). `back` er lenken nederst; standard er ordrelista (Annonsetekst
 * gaar tilbake til sin egen side, T1).
 */
export function LoadState({
  load,
  onRetry,
  back = { href: ORDERS_PATH, key: "orders.back" },
}: {
  load: Exclude<AssignmentLoad, { kind: "ok" }>;
  onRetry: () => void;
  back?: { href: string; key: UiKey };
}) {
  const locale = useLocale();
  if (load.kind === "loading") {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <div className="flex flex-col items-center justify-center py-24 gap-4" role="status">
          <div className="w-8 h-8 border-4 border-line border-t-ink rounded-full animate-spin motion-reduce:animate-none" />
          <p className="text-ink-2 text-sm">{t(locale, "orders.imagesLoading")}</p>
        </div>
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <Card padding="lg" className="text-center max-w-lg mx-auto">
        {load.kind === "not_found" ? (
          <>
            <p className="text-ink font-medium text-lg mb-2">{t(locale, "orders.notFound")}</p>
            <p className="text-ink-2 text-sm mb-6">{t(locale, "orders.notFoundHint")}</p>
          </>
        ) : (
          <>
            <p className="text-red-fg font-medium mb-2">{t(locale, "orders.imagesLoadError")}</p>
            <p className="text-ink-2 text-sm mb-6">{codeText(locale, "assignmentError", load.code)}</p>
            <Button onClick={onRetry}>{t(locale, "review.retry")}</Button>
          </>
        )}
        <p className="mt-6">
          <Link href={back.href} className={`text-sm text-ink underline ${FOCUS}`}>
            {t(locale, back.key)}
          </Link>
        </p>
      </Card>
    </main>
  );
}
