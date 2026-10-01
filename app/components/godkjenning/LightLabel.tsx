"use client";

import type { ReviewLight } from "../../lib/api";
import { codeText, t, type Locale } from "../../lib/i18n";
import { BADGE } from "./classes";

/**
 * En lyskilde: lampetypen, og plasseringen naar `location` er satt.
 * Plasseringen er fritekst fra analysen, ofte paa engelsk, saa den vises bare
 * i «Detaljer» og i rettingen (D2c, Petter 01.10, valg B), ikke i «Stemning
 * og lys». Grunnen fra analysen («ikke bekreftet») vises bare i «Detaljer» (`reason`). «Usikker» vises i rettingen for
 * ustabile og avviste (D2b, avvik 3 A). Merkelappene «Slått på/av av deg»
 * viser valg brukeren selv har gjort, ikke analysen.
 */
export function LightLabel({
  light,
  locale,
  location = false,
  reason = false,
  uncertain = false,
  state = false,
}: {
  light: ReviewLight;
  locale: Locale;
  location?: boolean;
  reason?: boolean;
  uncertain?: boolean;
  state?: boolean;
}) {
  return (
    <>
      <span className="font-bold">{codeText(locale, "lightType", light.type)}</span>
      {/* location er fritekst fra analysen; React escaper den. */}
      {location && light.location && <span className="text-ink-2"> · {light.location}</span>}
      {reason && light.reasonCode !== null && (
        <span className="text-ink-2">
          {" "}
          ({codeText(locale, "lightReason", light.reasonCode)})
        </span>
      )}
      {uncertain && <span className={BADGE}>{t(locale, "correct.uncertain")}</span>}
      {state && (light.state === "promoted" || light.state === "disabled") && (
        <span className={BADGE}>
          {t(locale, light.state === "promoted" ? "review.lightPromoted" : "review.lightDisabled")}
        </span>
      )}
    </>
  );
}
