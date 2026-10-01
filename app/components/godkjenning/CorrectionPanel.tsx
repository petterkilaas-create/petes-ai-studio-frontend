"use client";

import type { ReviewLight } from "../../lib/api";
import { canToggle, isOn, type Lights, type Toggles } from "../../lib/correction";
import { flatLights } from "../../lib/lightsView";
import { t, type Locale } from "../../lib/i18n";
import type { FireplaceAnswer } from "../../lib/review";
import { buttonClass } from "../ui/Button";
import { FOCUS } from "./classes";
import { FireplaceChoice } from "./FireplaceChoice";
import { LightLabel } from "./LightLabel";

const BTN_PRIMARY = buttonClass("primary");
const BTN_SECONDARY = buttonClass("secondary");

/**
 * «Korriger bildet» i handlingskortet (D2b, brief §5): én flat liste over
 * lysene, uten analysens kategorier, koder eller grunner. Ustabile og
 * avviste har merkelappen «Usikker» og starter som av. Peisspoersmaalet som
 * foer. Tidspunkt og himmel kan ikke endres her ennaa (TG-NEW-145), saa de
 * vises ikke. Body bygges av buildCorrection paa siden, uendret.
 */
export function CorrectionPanel({
  lights,
  toggles,
  onToggle,
  fireplaceShown,
  answer,
  onAnswer,
  confirmNeeded,
  confirmed,
  onConfirmed,
  roundsLeft,
  submitEnabled,
  onSubmit,
  onCancel,
  locked,
  locale,
}: {
  lights: Lights;
  toggles: Toggles;
  /** `uncertain` er kandidat-flagget til setToggle. */
  onToggle: (light: ReviewLight, uncertain: boolean, on: boolean) => void;
  fireplaceShown: boolean;
  answer: FireplaceAnswer;
  onAnswer: (answer: "yes" | "no") => void;
  confirmNeeded: boolean;
  confirmed: boolean;
  onConfirmed: (confirmed: boolean) => void;
  roundsLeft: number;
  submitEnabled: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  locked: boolean;
  locale: Locale;
}) {
  const rows = flatLights(lights);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-ink font-bold">{t(locale, "correct.title")}</p>
        <p className="text-xs text-ink-2 mt-1">{t(locale, "correct.hint")}</p>
      </div>

      <div>
        <p className="text-xs font-bold text-ink mb-2">{t(locale, "correct.lightsTitle")}</p>
        {rows.length === 0 ? (
          <p className="text-xs text-ink-2">{t(locale, "review.lightsEmpty")}</p>
        ) : (
          <ul className="space-y-2 text-xs text-ink">
            {rows.map(({ light, uncertain }, i) => {
              const editable = canToggle(light, uncertain);
              const on = isOn(light, toggles);
              // Ekte bryter (checkbox med role=switch) med hele raden som
              // etikett, minst 44 px hoey for tommel paa mobil.
              return (
                <li key={`${light.key ?? light.id ?? "x"}-${i}`}>
                  <label
                    className={`flex items-center gap-3 min-h-11 px-3 py-2 rounded-button border ${
                      editable ? "border-line-strong cursor-pointer" : "border-line opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      disabled={!editable || locked}
                      onChange={(e) => onToggle(light, uncertain, e.target.checked)}
                      className={`w-5 h-5 shrink-0 accent-primary ${FOCUS}`}
                    />
                    <span className="flex-1">
                      <LightLabel light={light} locale={locale} uncertain={uncertain} state />
                    </span>
                    <span className="text-[13px] text-ink-2">
                      {editable
                        ? t(locale, on ? "correct.lightOn" : "correct.lightOff")
                        : t(locale, "correct.locked")}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {fireplaceShown && (
        <FireplaceChoice answer={answer} onChange={onAnswer} disabled={locked} locale={locale} />
      )}

      {confirmNeeded && (
        <label className="flex items-start gap-3 min-h-11 cursor-pointer text-sm text-ink">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={locked}
            onChange={(e) => onConfirmed(e.target.checked)}
            className={`w-5 h-5 mt-0.5 shrink-0 accent-primary ${FOCUS}`}
          />
          <span>{t(locale, "correct.confirmExists")}</span>
        </label>
      )}

      <p className="text-xs text-ink-2">{t(locale, "correct.roundsLeft", { n: roundsLeft })}</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={onSubmit} disabled={locked || !submitEnabled} className={BTN_PRIMARY}>
          {t(locale, "action.makeNewImage")}
        </button>
        <button onClick={onCancel} disabled={locked} className={BTN_SECONDARY}>
          {t(locale, "action.cancel")}
        </button>
      </div>
      <p className="text-xs text-ink-2">{t(locale, "correct.newImageFromOriginal")}</p>
    </div>
  );
}
