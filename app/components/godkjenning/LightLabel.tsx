"use client";

import type { ReviewLight } from "../../lib/api";
import { codeText, t, type Locale } from "../../lib/i18n";
import { lightText, type LightName } from "../../lib/lightsView";
import { BADGE } from "./classes";

/**
 * En lyskilde: lampetypen med nummer naar typen finnes flere ganger, og
 * sonen i bildet (TG-NEW-148): «Utvendig vegglampe 3 · til høyre». Begge er
 * koder fra ordlista, saa de vises overalt. Plasseringen fra analysen er
 * engelsk fritekst og vises bare i «Detaljer» (`location`), merket som
 * analysens tekst (Petter 05.10, punkt 3). Grunnen fra analysen («ikke
 * bekreftet») vises bare i «Detaljer» (`reason`). «Usikker» vises i rettingen
 * for ustabile og avviste (D2b, avvik 3 A). Merkelappene «Slått på/av av deg»
 * viser valg brukeren selv har gjort, ikke analysen.
 */
export function LightLabel({
  light,
  name,
  locale,
  location = false,
  reason = false,
  uncertain = false,
  state = false,
}: {
  light: ReviewLight;
  name: LightName;
  locale: Locale;
  location?: boolean;
  reason?: boolean;
  uncertain?: boolean;
  state?: boolean;
}) {
  const text = lightText(locale, light, name);
  return (
    <>
      <span className="font-bold">{text.title}</span>
      {text.zone !== null && <span className="text-ink-2"> · {text.zone}</span>}
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
      {/* location er fritekst fra analysen; React escaper den. */}
      {location && light.location && (
        <span className="block text-ink-2">{t(locale, "review.analysisLocation", { text: light.location })}</span>
      )}
    </>
  );
}
