"use client";

import type { JobReviewDetail, ReviewLight, RunValue } from "../../lib/api";
import { codeText, t, type Locale } from "../../lib/i18n";
import { lightNames, type LightName } from "../../lib/lightsView";
import { fireplaceAnswerKey } from "../../lib/review";
import { cardClass } from "../ui/Card";
import { FOCUS, LABEL } from "./classes";
import { LightLabel } from "./LightLabel";

const CARD = cardClass("md");

function RunValueLine({
  label,
  value,
  group,
  locale,
}: {
  label: string;
  value: RunValue;
  group: "imageType" | "skyVisibility";
  locale: Locale;
}) {
  const distinct = [...new Set(value.runValues)];
  return (
    <div>
      <p className="text-xs text-ink-2">{label}</p>
      <p className="text-sm text-ink">{codeText(locale, group, value.value)}</p>
      {distinct.length > 1 && (
        <p className="text-xs text-amber-fg">
          {t(locale, "review.runValues", {
            values: distinct.map((v) => codeText(locale, group, v)).join(" / "),
          })}
        </p>
      )}
    </div>
  );
}

function LightList({
  title,
  lights,
  nameOf,
  locale,
}: {
  title: string;
  lights: ReviewLight[];
  nameOf: (light: ReviewLight) => LightName;
  locale: Locale;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-ink mb-2">
        {title} ({lights.length})
      </p>
      {lights.length === 0 ? (
        <p className="text-xs text-ink-2">{t(locale, "review.lightsEmpty")}</p>
      ) : (
        <ul className="space-y-1 text-xs text-ink">
          {lights.map((light, i) => (
            <li key={`${light.key ?? light.id ?? "x"}-${i}`}>
              <LightLabel light={light} name={nameOf(light)} locale={locale} location reason state />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * «Detaljer» (D2b, brief §3 punkt 6): analysen, med grunner, flagg,
 * uenighet mellom kjoeringene og de tre lyslistene. Siden viser panelet bare
 * naar showDetails(caps) er sann (i dag bare admin). Lukket som standard.
 */
export function DetailsPanel({ review, locale }: { review: JobReviewDetail; locale: Locale }) {
  const nameOf = lightNames(review.lights);
  return (
    <details className={CARD}>
      <summary className={`min-h-11 flex items-center cursor-pointer rounded-button text-sm font-medium text-ink ${FOCUS}`}>
        {t(locale, "review.details")}
      </summary>
      <div className="mt-4 flex flex-col gap-6">
        {review.reasonCodes.length > 0 && (
          <div>
            <p className={`${LABEL} mb-2`}>{t(locale, "review.reasons")}</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink">
              {review.reasonCodes.map((c, i) => (
                <li key={`${c}-${i}`}>{codeText(locale, "reasonCode", c)}</li>
              ))}
            </ul>
          </div>
        )}
        {review.flagCodes.length > 0 && (
          <div>
            <p className={`${LABEL} mb-2`}>{t(locale, "review.notes")}</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink">
              {review.flagCodes.map((c, i) => (
                <li key={`${c}-${i}`}>{codeText(locale, "flagCode", c)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <p className={`${LABEL} mb-0`}>{t(locale, "review.analysisTitle")}</p>
          <RunValueLine
            label={t(locale, "review.imageType")}
            value={review.imageType}
            group="imageType"
            locale={locale}
          />
          <RunValueLine
            label={t(locale, "review.sky")}
            value={review.skyVisibility}
            group="skyVisibility"
            locale={locale}
          />
          <div>
            <p className="text-xs text-ink-2">{t(locale, "review.fireplace")}</p>
            <p className="text-sm text-ink">
              {review.fireplace.disagreement
                ? t(locale, "review.fireplaceDisagreement")
                : review.fireplace.present
                  ? t(locale, "review.fireplacePresent")
                  : t(locale, "review.fireplaceNone")}
            </p>
            {(review.fireplace.answer === "yes" || review.fireplace.answer === "no") && (
              <p className="text-xs text-ink-2">
                {t(locale, "review.fireplaceAnswered", {
                  answer: t(locale, fireplaceAnswerKey(review.fireplace.answer)),
                })}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <p className={`${LABEL} mb-0`}>{t(locale, "review.lights")}</p>
          {review.validRuns === 0 && <p className="text-xs text-amber-fg">{t(locale, "review.noValidRuns")}</p>}
          <LightList title={t(locale, "review.lightsApproved")} lights={review.lights.approved} nameOf={nameOf} locale={locale} />
          <LightList title={t(locale, "review.lightsUnstable")} lights={review.lights.unstable} nameOf={nameOf} locale={locale} />
          <LightList title={t(locale, "review.lightsRejected")} lights={review.lights.rejected} nameOf={nameOf} locale={locale} />
        </div>
      </div>
    </details>
  );
}
