"use client";

import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fetchJobDownload } from "../../lib/api";
import { downloadMarkedImage } from "../../lib/download";
import { t, type Locale, type UiKey } from "../../lib/i18n";
import { buttonClass } from "../ui/Button";

const BTN_PRIMARY = buttonClass("primary");

/**
 * «Last ned merket bilde» (merking PR 4) i done-kortet. Vises bare for
 * eieren (canDownload); backend avviser admin paa andres jobb. Ved feil vises
 * en kort melding ut fra koden, aldri raa tekst.
 */
export function DownloadButton({ jobId, locale }: { jobId: string; locale: Locale }) {
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
        fetchFile: () => fetchJobDownload({ jobId, getToken }),
      });
      if (result.kind === "error") setError(result.key);
    } finally {
      inFlight.current = false;
      setDownloading(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-2 items-start">
      <button onClick={onDownload} disabled={downloading} className={BTN_PRIMARY}>
        {t(locale, downloading ? "review.downloading" : "review.download")}
      </button>
      <span className="text-xs text-amber-fg" role="status">
        {error ? t(locale, error) : ""}
      </span>
    </div>
  );
}
