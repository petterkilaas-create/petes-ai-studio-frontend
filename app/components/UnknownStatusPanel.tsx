"use client";

import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Noeytralt panel naar backend sender en status frontend ikke kjenner
 * (2c-2). Pollingen er allerede stoppet — aldri evig polling, aldri roed feil.
 * Teksten fra ordlista (TG-NEW-158).
 */
export function UnknownStatusPanel() {
  const locale = useLocale();

  return (
    <div className="bg-neutral-bg text-neutral-fg rounded-button p-4 text-sm space-y-2">
      <p className="font-medium">
        {t(locale, "unknownStatus.title")}
      </p>
    </div>
  );
}
