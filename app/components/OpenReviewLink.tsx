"use client";

import Link from "next/link";
import { t, type UiKey } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Lenke til godkjenningssiden (2d-1) for jobber i «Til kontroll» og
 * «Til gjennomgang». Brukes fra Express og /history.
 */
export function OpenReviewLink({
  jobId,
  labelKey = "express.openReview",
}: {
  jobId: string;
  labelKey?: UiKey;
}) {
  const locale = useLocale();
  return (
    <Link
      href={`/godkjenning/${encodeURIComponent(jobId)}`}
      className="inline-block px-5 py-2.5 bg-[#009183] hover:bg-[#00b09f] text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors focus:outline-none focus:ring-2 focus:ring-[#009183] focus:ring-offset-2 focus:ring-offset-[#0B1120]"
    >
      {t(locale, labelKey)}
    </Link>
  );
}
