"use client";

import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fetchPrivacyDownload } from "../lib/api";
import { downloadPrivacyImage } from "../lib/download";
import { t, type Locale, type UiKey } from "../lib/i18n";
import { buttonClass } from "./ui/Button";

const BTN_PRIMARY = buttonClass("primary");

/**
 * «Last ned» paa personvern-kortet i Historikk og paa /start (dag 51). Kortet
 * viser den bare naar canDownloadPrivacy(job) er sann; backend avviser alt
 * annet. Ved feil vises en kort melding ut fra koden, aldri raa tekst, som
 * DownloadButton i godkjenningen.
 */
export function PrivacyDownloadButton({ jobId, locale }: { jobId: string; locale: Locale }) {
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
      const result = await downloadPrivacyImage({
        jobId,
        fetchFile: () => fetchPrivacyDownload({ jobId, getToken }),
      });
      if (result.kind === "error") setError(result.key);
    } finally {
      inFlight.current = false;
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 items-start">
      <button onClick={onDownload} disabled={downloading} className={BTN_PRIMARY}>
        {t(locale, downloading ? "review.downloading" : "express.download")}
      </button>
      <span className="text-xs text-amber-fg" role="status">
        {error ? t(locale, error) : ""}
      </span>
    </div>
  );
}
