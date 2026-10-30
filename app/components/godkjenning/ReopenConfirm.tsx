"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Locale, type UiKey } from "../../lib/i18n";
import { buttonClass } from "../ui/Button";

const BTN_SECONDARY = buttonClass("secondary");

/**
 * «Angre godkjenning» og «Angre» (FE-4, K 2.10) med bekreftelse: knappen
 * aapner spoersmaalet med «Ja, angre» og «Avbryt». Brukes i kortet etter
 * avgjoerelsen (ResultReview) og i meldingen etter hoppet paa ordresiden
 * (UndoNotice), med samme tekster. Kallet ligger hos eieren (`onConfirm`).
 * Fokus flyttes til «Ja, angre» naar spoersmaalet aapnes, og tilbake til
 * knappen ved «Avbryt».
 */
export function ReopenConfirm({
  keys,
  onConfirm,
  locked,
  working,
  onOpenChange,
  locale,
}: {
  keys: { button: UiKey; confirm: UiKey };
  onConfirm: () => void;
  locked: boolean;
  /** Kallet er sendt: «Angrer …» paa knappen. */
  working: boolean;
  /** Spoersmaalet aapnes eller lukkes (meldingen staar da til den lukkes). */
  onOpenChange?: (open: boolean) => void;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusButton = useRef(false);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
    else if (focusButton.current) {
      focusButton.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  if (!open) {
    return (
      <div className="mt-4">
        <button ref={buttonRef} type="button" onClick={() => change(true)} disabled={locked} className={BTN_SECONDARY}>
          {t(locale, keys.button)}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2" role="group" aria-label={t(locale, keys.button)}>
      <p className="text-sm text-ink">{t(locale, keys.confirm)}</p>
      <div className="flex flex-wrap gap-3">
        <button ref={confirmRef} type="button" onClick={onConfirm} disabled={locked} className={BTN_SECONDARY}>
          {t(locale, working ? "reopen.working" : "reopen.confirm")}
        </button>
        <button
          type="button"
          onClick={() => {
            focusButton.current = true;
            change(false);
          }}
          disabled={locked}
          className={BTN_SECONDARY}
        >
          {t(locale, "action.cancel")}
        </button>
      </div>
    </div>
  );
}
