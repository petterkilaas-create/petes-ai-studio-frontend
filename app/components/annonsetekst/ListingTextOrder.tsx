"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAssignment } from "../../hooks/useAssignment";
import { LISTING_TEXT_PATH } from "../../lib/services";
import { LoadState } from "../ordre/LoadState";
import { PageHeader } from "../ui/PageHeader";
import { FOCUS } from "../godkjenning/classes";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

const BACK = { href: LISTING_TEXT_PATH, key: "listingText.page.back" } as const;

/**
 * Tekstsiden for en ordre (TG-NEW-281, T1): overskriften og adressen, hentet
 * med GET /v1/assignments/{id}. Plassholder; T2-T4 legger til bestillingen,
 * behandlingen og tekstpakken (styrt av `display_status`).
 */
export function ListingTextOrder({ assignmentId }: { assignmentId: string }) {
  const locale = useLocale();
  const { load, reload } = useAssignment(assignmentId);

  if (load.kind !== "ok") return <LoadState load={load} onRetry={() => void reload()} back={BACK} />;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <Link
        href={LISTING_TEXT_PATH}
        className={`mb-6 inline-flex min-h-11 items-center gap-2 rounded-button text-sm text-ink-2 hover:text-ink ${FOCUS}`}
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        {t(locale, BACK.key)}
      </Link>
      <PageHeader
        title={t(locale, "listingText.page.title")}
        subtitle={<span className="break-words">{load.assignment.address}</span>}
      />
    </main>
  );
}
