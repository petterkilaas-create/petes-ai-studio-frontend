"use client";

import { useId } from "react";
import type { LocalInstruction } from "../../lib/api";
import { t, type Locale, type UiKey } from "../../lib/i18n";
import {
  LOCAL_INSTRUCTION_KEYS,
  LOCAL_INSTRUCTIONS,
  LOCAL_MISSING_KEYS,
  LOCAL_TEXT_MAX,
  localBox,
  type LocalMissing,
} from "../../lib/local";
import { canRedo, canUndo, redo, removeMark, undo, type StudioState } from "../../lib/studio";
import { buttonClass } from "../ui/Button";
import { choiceClass, FOCUS } from "./classes";

const BTN_PRIMARY = buttonClass("primary");
const BTN_SECONDARY = buttonClass("secondary");

/**
 * «Marker og beskriv» i «Korriger bildet» (FE-3, Dag 58). Lerretet med boksen
 * staar i bildeflaten paa siden (StudioCanvas); her er Angre, Gjoer om og
 * «Fjern boksen» som knapper (WCAG 2.5.7), de fire instruksene, tekstfeltet
 * for Legg til (hoeyst 200 tegn, med teller) og linja «2 forslag · bare det
 * markerte endres · runder igjen». Body bygges av buildLocalCorrection paa siden.
 */
export function LocalEditPanel({
  studio,
  onStudio,
  instruction,
  onInstruction,
  text,
  onText,
  missing,
  info,
  onSubmit,
  onCancel,
  locked,
  locale,
}: {
  studio: StudioState;
  onStudio: (next: StudioState) => void;
  instruction: LocalInstruction | null;
  onInstruction: (instruction: LocalInstruction) => void;
  text: string;
  onText: (text: string) => void;
  /** Hva som mangler foer knappen kan trykkes (localMissing). */
  missing: LocalMissing;
  /** Linja under instruksene (localInfo). */
  info: { key: UiKey; vars: Record<string, number> };
  onSubmit: () => void;
  onCancel: () => void;
  locked: boolean;
  locale: Locale;
}) {
  const textId = useId();
  const countId = useId();
  const box = localBox(studio);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-ink font-bold">{t(locale, "local.title")}</p>
        <p className="text-xs text-ink-2 mt-1">{t(locale, "local.hint")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onStudio(undo(studio))}
          disabled={locked || !canUndo(studio)}
          className={BTN_SECONDARY}
        >
          {t(locale, "local.undo")}
        </button>
        <button
          type="button"
          onClick={() => onStudio(redo(studio))}
          disabled={locked || !canRedo(studio)}
          className={BTN_SECONDARY}
        >
          {t(locale, "local.redo")}
        </button>
        <button
          type="button"
          onClick={() => box !== null && onStudio(removeMark(studio, box.id))}
          disabled={locked || box === null}
          className={BTN_SECONDARY}
        >
          {t(locale, "local.removeBox")}
        </button>
      </div>

      <fieldset>
        <legend className="text-xs font-bold text-ink mb-2">{t(locale, "local.instructions")}</legend>
        <div className="flex flex-wrap gap-2">
          {LOCAL_INSTRUCTIONS.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={instruction === code}
              onClick={() => onInstruction(code)}
              disabled={locked}
              className={choiceClass(instruction === code, "rounded-pill")}
            >
              {t(locale, LOCAL_INSTRUCTION_KEYS[code])}
            </button>
          ))}
        </div>
      </fieldset>

      {instruction === "add" && (
        <div>
          <label htmlFor={textId} className="block text-xs font-bold text-ink mb-2">
            {t(locale, "local.textLabel")}
          </label>
          <textarea
            id={textId}
            value={text}
            maxLength={LOCAL_TEXT_MAX}
            rows={3}
            disabled={locked}
            aria-describedby={countId}
            onChange={(e) => onText(e.target.value)}
            className={`w-full rounded-button border border-line-strong bg-surface p-3 text-sm text-ink ${FOCUS}`}
          />
          <p id={countId} className="text-xs text-ink-2 mt-1 text-right" aria-live="polite">
            {t(locale, "local.textCount", { n: text.length, max: LOCAL_TEXT_MAX })}
          </p>
        </div>
      )}

      <p className="text-xs text-ink-2">{t(locale, info.key, info.vars)}</p>
      {missing !== null && <p className="text-xs text-ink-2">{t(locale, LOCAL_MISSING_KEYS[missing])}</p>}
      <div className="flex flex-wrap gap-3">
        <button onClick={onSubmit} disabled={locked || missing !== null} className={BTN_PRIMARY}>
          {t(locale, "local.submit")}
        </button>
        <button onClick={onCancel} disabled={locked} className={BTN_SECONDARY}>
          {t(locale, "action.cancel")}
        </button>
      </div>
    </div>
  );
}
