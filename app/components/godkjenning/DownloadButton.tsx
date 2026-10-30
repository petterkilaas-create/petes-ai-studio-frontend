"use client";

import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fetchJobDownload } from "../../lib/api";
import { downloadMarkedImage } from "../../lib/download";
import { t, type Locale, type UiKey } from "../../lib/i18n";
import { buttonClass } from "../ui/Button";

const BTN_PRIMARY = buttonClass("primary");
const BTN_ROW = buttonClass("secondary", "px-4");

/**
 * «Last ned merket bilde» (merking PR 4) i done-kortet. Vises bare for
 * eieren (canDownload); backend avviser admin paa andres jobb. Ved feil vises
 * en kort melding ut fra koden, aldri raa tekst. I fillista paa nedlastingen
 * (FE-5) er knappen en sekundaer «Last ned fil» med filnavnet fra manifestet.
 */
export function DownloadButton({
  jobId,
  presetId,
  locale,
  fileName = null,
  ariaLabel,
}: {
  jobId: string;
  /** Oppskriften fra review-svaret (G3); bestemmer filnavnet. */
  presetId: string | null;
  locale: Locale;
  /** Filnavnet fra manifestet (K 2.8); gir raden i fillista i stedet for done-kortet. */
  fileName?: string | null;
  ariaLabel?: string;
}) {
  const row = fileName !== null;
  const { getToken } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<UiKey | null>(null);
  // Synkront vern mot dobbeltklikk, som inFlight paa siden.
  const inFlight = useRef(false);

  const onDownload = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDownloading(true);
    setError(null);
    try {
      const result = await downloadMarkedImage({
        jobId,
        presetId,
        fileName,
        fetchFile: () => fetchJobDownload({ jobId, getToken }),
      });
      if (result.kind === "error") setError(result.key);
    } finally {
      inFlight.current = false;
      setDownloading(false);
    }
  };

  const label = row ? "delivery.single" : "review.download";
  return (
    <div className={row ? "flex flex-col gap-1 items-start" : "mt-6 flex flex-col gap-2 items-start"}>
      <button onClick={onDownload} disabled={downloading} aria-label={ariaLabel} className={row ? BTN_ROW : BTN_PRIMARY}>
        {t(locale, downloading ? "review.downloading" : label)}
      </button>
      <span className="text-xs text-amber-fg" role="status">
        {error ? t(locale, error) : ""}
      </span>
    </div>
  );
}
