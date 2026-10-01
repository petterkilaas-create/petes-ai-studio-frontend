"use client";

import type { JobReviewDetail } from "../../lib/api";
import { duskFacts } from "../../lib/dusk";
import { codeText, t, type Locale } from "../../lib/i18n";
import { litLights } from "../../lib/lightsView";
import { fireplaceAnswerKey } from "../../lib/review";
import { cardClass } from "../ui/Card";
import { LABEL } from "./classes";
import { LightLabel } from "./LightLabel";

const CARD = cardClass("md");

/**
 * Stemning og lys i sidepanelet (D2b, brief §4): valgene megleren gjorde
 * (tidspunkt, himmel, peis) og lysene som tennes, bare med lampetypen. Ingen
 * analyse her (brief §3 punkt 6), og ingen plassering (fritekst fra
 * analysen, D2c); den ligger i «Detaljer». Himmelen vises
 * ikke som valg naar den ikke ble brukt (sky_applied false).
 */
export function MoodPanel({
  review,
  locale,
}: {
  review: Pick<JobReviewDetail, "dusk" | "lights" | "fireplace">;
  locale: Locale;
}) {
  const facts = duskFacts(review.dusk);
  const lit = litLights(review.lights);
  const fire = review.fireplace.answer === "yes" || review.fireplace.answer === "no" ? review.fireplace.answer : null;
  return (
    <section className={`${CARD} flex flex-col gap-4`}>
      <p className={`${LABEL} mb-0`}>{t(locale, "review.moodTitle")}</p>
      {facts !== null && (
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs text-ink-2">{t(locale, "dusk.time")}</p>
            <p className="text-sm text-ink">{codeText(locale, "duskTime", facts.time)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-2">{t(locale, "dusk.sky")}</p>
            <p className="text-sm text-ink">
              {facts.sky.kind === "not_applied"
                ? t(locale, "review.duskSkyNotApplied")
                : codeText(locale, "duskSky", facts.sky.code)}
            </p>
          </div>
        </div>
      )}
      {fire !== null && (
        <div>
          <p className="text-xs text-ink-2">{t(locale, "review.fireplace")}</p>
          <p className="text-sm text-ink">{t(locale, fireplaceAnswerKey(fire))}</p>
        </div>
      )}
      <div>
        <p className="text-xs text-ink-2 mb-1">{t(locale, "review.lightsLit")}</p>
        {lit.length === 0 ? (
          <p className="text-sm text-ink">{t(locale, "review.lightsEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-sm text-ink">
            {lit.map((light, i) => (
              <li key={`${light.key ?? light.id ?? "x"}-${i}`}>
                <LightLabel light={light} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
