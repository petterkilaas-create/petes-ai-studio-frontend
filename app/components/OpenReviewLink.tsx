"use client";

import { ButtonLink } from "./ui/Button";
import { t, type UiKey } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Lenke til godkjenningssiden (2d-1) for jobber til godkjenning, og «Åpne»
 * paa egne godkjente kveldsbilder. Brukes fra Express og /history.
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
    <ButtonLink href={`/godkjenning/${encodeURIComponent(jobId)}`}>{t(locale, labelKey)}</ButtonLink>
  );
}
