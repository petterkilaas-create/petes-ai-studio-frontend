"use client";

import { useId } from "react";
import type { LocalInstruction } from "../../lib/api";
import { t, type Locale, type UiKey } from "../../lib/i18n";
import {
  draftFor,
  LOCAL_INSTRUCTION_KEYS,
  LOCAL_INSTRUCTIONS,
  LOCAL_TEXT_MAX,
  localBoxes,
  type EditDraft,
  type EditDrafts,
} from "../../lib/local";
import { canRedo, canUndo, redo, removeMark, undo, type StudioState } from "../../lib/studio";
import { buttonClass } from "../ui/Button";
import { choiceClass, FOCUS } from "./classes";

const BTN_PRIMARY = buttonClass("primary", "min-h-12 w-full sm:w-auto");
const BTN_SECONDARY = buttonClass("secondary", "min-h-11");

/**
 * «Marker og beskriv», studio v2 (Dag 58, designet brett 8 og 9). Lerretet
 * med boksene staar i bildeflaten paa siden (StudioCanvas); her er lista med
 * én rad per boks, med samme nummer (1–4) som i bildet: instruksen (Slukk,
 * Tenn, Fjern dette, Legg til med tekst) og «Fjern». Peker man paa en rad
 * (eller fokuserer i den), lyser boksen opp, og omvendt (`activeId`).
 *
 * Angre og Gjoer om er knapper (WCAG 2.5.7). Én knapp «Utfør endringene (N)»
 * med linja «Runder igjen: X av 3 · bare de markerte områdene endres». Paa
 * mobil staar lista under bildet, og knappene er minst 44 px hoeye.
 * Body bygges av buildLocalCorrection paa siden.
 */
function EditRow({
  n,
  id,
  draft,
  onDraft,
  onRemove,
  active,
  onActive,
  locked,
  locale,
}: {
  n: number;
  id: number;
  draft: EditDraft;
  onDraft: (draft: EditDraft) => void;
  onRemove: () => void;
  active: boolean;
  onActive: (id: number | null) => void;
  locked: boolean;
  locale: Locale;
}) {
  const textId = useId();
  const countId = useId();
  const legendId = useId();
  return (
    <li
      onPointerEnter={(e) => e.pointerType === "mouse" && onActive(id)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onActive(null)}
      onFocus={() => onActive(id)}
      className={`flex flex-col gap-3 rounded-button border p-3 transition-colors ${
        active ? "border-primary bg-surface-2" : "border-line"
      }`}
    >
      <fieldset aria-labelledby={legendId} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span id={legendId} className="flex items-center gap-2 text-sm font-bold text-ink">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 items-center justify-center rounded-pill text-sm font-semibold text-surface ${
                active ? "bg-primary" : "bg-ink"
              }`}
            >
              {n}
            </span>
            {t(locale, "local.editTitle", { n })}
          </span>
          <button type="button" onClick={onRemove} disabled={locked} className={BTN_SECONDARY}>
            {t(locale, "local.removeEdit")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {LOCAL_INSTRUCTIONS.map((code: LocalInstruction) => (
            <button
              key={code}
              type="button"
              aria-pressed={draft.instruction === code}
              onClick={() => onDraft({ ...draft, instruction: code })}
              disabled={locked}
              className={choiceClass(draft.instruction === code, "rounded-pill")}
            >
              {t(locale, LOCAL_INSTRUCTION_KEYS[code])}
            </button>
          ))}
        </div>
        {draft.instruction === "add" && (
          <div>
            <label htmlFor={textId} className="block text-xs font-bold text-ink mb-2">
              {t(locale, "local.textLabel")}
            </label>
            <textarea
              id={textId}
              value={draft.text}
              maxLength={LOCAL_TEXT_MAX}
              rows={2}
              disabled={locked}
              aria-describedby={countId}
              onChange={(e) => onDraft({ ...draft, text: e.target.value })}
              className={`w-full rounded-button border border-line-strong bg-surface p-3 text-sm text-ink ${FOCUS}`}
            />
            <p id={countId} className="text-xs text-ink-2 mt-1 text-right" aria-live="polite">
              {t(locale, "local.textCount", { n: draft.text.length, max: LOCAL_TEXT_MAX })}
            </p>
          </div>
        )}
      </fieldset>
    </li>
  );
}

export function LocalEditPanel({
  studio,
  onStudio,
  drafts,
  onDraft,
  activeId,
  onActive,
  missing,
  rejected,
  info,
  onSubmit,
  onCancel,
  locked,
  locale,
}: {
  studio: StudioState;
  onStudio: (next: StudioState) => void;
  drafts: EditDrafts;
  onDraft: (id: number, draft: EditDraft) => void;
  activeId: number | null;
  onActive: (id: number | null) => void;
  /** Hva som mangler foer knappen kan trykkes (localMissing og missingText), eller null. */
  missing: { key: UiKey; vars: Record<string, number> } | null;
  /** Hvorfor den siste boksen ble avvist (for mange eller overlapp), eller null. */
  rejected: UiKey | null;
  /** Linja under knappen (localInfo). */
  info: { key: UiKey; vars: Record<string, number> };
  onSubmit: () => void;
  onCancel: () => void;
  locked: boolean;
  locale: Locale;
}) {
  const boxes = localBoxes(studio);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-ink font-bold">{t(locale, "local.title")}</p>
        {boxes.length === 0 && <p className="text-sm text-ink mt-1">{t(locale, "local.hint")}</p>}
      </div>

      {rejected !== null && (
        <p className="text-sm text-amber-fg bg-amber-bg rounded-button p-3" role="status">
          {t(locale, rejected)}
        </p>
      )}

      {boxes.length > 0 && (
        <ol aria-label={t(locale, "local.listLabel")} className="flex flex-col gap-3">
          {boxes.map((box, i) => (
            <EditRow
              key={box.id}
              n={i + 1}
              id={box.id}
              draft={draftFor(drafts, box.id)}
              onDraft={(draft) => onDraft(box.id, draft)}
              onRemove={() => {
                onStudio(removeMark(studio, box.id));
                if (activeId === box.id) onActive(null);
              }}
              active={activeId === box.id}
              onActive={onActive}
              locked={locked}
              locale={locale}
            />
          ))}
        </ol>
      )}

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
      </div>

      {missing !== null && boxes.length > 0 && <p className="text-xs text-ink-2">{t(locale, missing.key, missing.vars)}</p>}
      <div className="flex flex-col gap-2">
        <button onClick={onSubmit} disabled={locked || missing !== null} className={BTN_PRIMARY}>
          {t(locale, "local.submit", { n: boxes.length })}
        </button>
        <p className="text-xs text-ink-2">{t(locale, info.key, info.vars)}</p>
        <button onClick={onCancel} disabled={locked} className={`${BTN_SECONDARY} w-full sm:w-auto`}>
          {t(locale, "action.cancel")}
        </button>
      </div>
    </div>
  );
}
