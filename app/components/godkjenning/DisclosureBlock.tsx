"use client";

import { useEffect, useRef, useState } from "react";
import { copyText, type CopyResult } from "../../lib/clipboard";
import {
  DISCLOSURE_DETAIL,
  DISCLOSURE_LOCALE,
  disclosureText,
  type ReviewDisclosure,
} from "../../lib/disclosure";
import { t, type Locale } from "../../lib/i18n";
import { buttonClass } from "../ui/Button";
import { FOCUS, LABEL } from "./classes";

const BTN_SECONDARY = buttonClass("secondary");

/**
 * «Tekst til annonsen» (merking PR 2) i done-kortet for godkjente jobber.
 * Teksten er alltid norsk (annonsens spraak) inntil TG-NEW-129; overskrift
 * og knapper foelger nettleseren. Kopiering endrer ingenting i backend, saa
 * admin paa andres jobb ser og kan kopiere det samme.
 */
export function DisclosureBlock({ disclosure, locale }: { disclosure: ReviewDisclosure | null; locale: Locale }) {
  const [copy, setCopy] = useState<CopyResult | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const result = disclosureText(DISCLOSURE_LOCALE, disclosure, DISCLOSURE_DETAIL);
  if (result === null) return null;

  const onCopy = async (text: string) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    const outcome = await copyText(text);
    setCopy(outcome);
    if (outcome === "copied") {
      resetTimer.current = setTimeout(() => setCopy(null), 2000);
    } else {
      // Reserve: marker teksten, saa megleren kan trykke Cmd+C.
      boxRef.current?.focus();
      boxRef.current?.select();
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-3">
      <p className={`${LABEL} mb-0`}>{t(locale, "review.disclosureTitle")}</p>
      {result.kind === "missing" ? (
        <p
          className="text-sm text-amber-fg bg-amber-bg rounded-button p-3"
          role="status"
        >
          {t(locale, "review.disclosureMissing")}
        </p>
      ) : (
        <>
          <textarea
            ref={boxRef}
            readOnly
            value={result.text}
            rows={3}
            lang={DISCLOSURE_LOCALE}
            aria-label={t(locale, "review.disclosureTitle")}
            className={`w-full resize-none bg-surface border border-ink-2 rounded-button p-3 text-sm text-ink ${FOCUS}`}
          />
          <p className="text-xs text-ink-2">{t(locale, "review.disclosureHelp")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => onCopy(result.text)} className={BTN_SECONDARY}>
              {t(locale, copy === "copied" ? "review.copied" : "action.copy")}
            </button>
            <span className="text-xs text-amber-fg" role="status">
              {copy === "failed" ? t(locale, "review.copyFailed") : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
