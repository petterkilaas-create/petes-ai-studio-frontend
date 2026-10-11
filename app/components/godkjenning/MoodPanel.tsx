"use client";

import type { JobReviewDetail } from "../../lib/api";
import { duskFacts, duskLine, styleFacts, styleFellBack } from "../../lib/dusk";
import { codeText, t, type Locale } from "../../lib/i18n";
import { lightNames, litLights } from "../../lib/lightsView";
import { fireplaceAnswerKey } from "../../lib/review";
import { cardClass } from "../ui/Card";
import { LABEL } from "./classes";
import { LightLabel } from "./LightLabel";

const CARD = cardClass("md");

/**
 * Stemning og lys i sidepanelet (D2b, brief §4): valgene megleren gjorde
 * (tidspunkt, himmel, peis) og lysene som tennes, med lampetype, nummer og
 * sone (TG-NEW-148). Ingen analyse her (brief §3 punkt 6), og ingen
 * plassering fra analysen (fritekst, D2c); den ligger i «Detaljer». Himmelen vises
 * ikke som valg naar den ikke ble brukt (sky_applied false).
 *
 * Megleren (`admin` false, TG-NEW-193) ser valgene i én kort linje
 * («Tidlig skumring · Klar blå time»), uten «ikke brukt» om himmelen og uten
 * peisen. Admin ser alt som foer.
 *
 * Stil v2 (TG-NEW-189): begge roller faar en linje naar jobben ba om varm
 * skumring, men runden ble laget med standardstilen. Admin ser ogsaa stilen
 * som ble brukt, med den bestilte naar den er en annen. Ingen av delene
 * vises foer runden har en prompt (`applied` null, f.eks. needs_review).
 */
export function MoodPanel({
  review,
  admin,
  locale,
}: {
  review: Pick<JobReviewDetail, "dusk" | "style" | "lights" | "fireplace">;
  admin: boolean;
  locale: Locale;
}) {
  const facts = admin ? duskFacts(review.dusk) : null;
  const line = admin ? null : duskLine(review.dusk);
  const style = admin ? styleFacts(review.style) : null;
  const fellBack = styleFellBack(review.style);
  const lit = litLights(review.lights);
  const nameOf = lightNames(review.lights);
  const fire =
    admin && (review.fireplace.answer === "yes" || review.fireplace.answer === "no") ? review.fireplace.answer : null;
  return (
    <section className={`${CARD} flex flex-col gap-4`}>
      <p className={`${LABEL} mb-0`}>{t(locale, "review.moodTitle")}</p>
      {fellBack && <p className="text-sm text-ink">{t(locale, "review.styleFellBack")}</p>}
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
          {style !== null && (
            <div>
              <p className="text-xs text-ink-2">{t(locale, "review.style")}</p>
              <p className="text-sm text-ink">
                {style.requested === null
                  ? codeText(locale, "duskStyle", style.applied)
                  : t(locale, "review.styleOrdered", {
                      applied: codeText(locale, "duskStyle", style.applied),
                      requested: codeText(locale, "duskStyle", style.requested),
                    })}
              </p>
            </div>
          )}
        </div>
      )}
      {line !== null && (
        <p className="text-sm text-ink">
          {[
            line.time === null ? null : codeText(locale, "duskTime", line.time),
            line.sky === null ? null : codeText(locale, "duskSky", line.sky),
          ]
            .filter((s): s is string => s !== null)
            .join(" · ")}
        </p>
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
                <LightLabel light={light} name={nameOf(light)} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
