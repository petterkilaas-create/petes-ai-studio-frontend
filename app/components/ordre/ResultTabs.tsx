"use client";

import { useRef, type KeyboardEvent } from "react";
import { resultStatusKey, type AssignmentResult } from "../../lib/assignments";
import { resultLabel } from "../../lib/brett";
import { stripKey } from "../../lib/player";
import { FOCUS } from "../godkjenning/classes";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/** Id-ene fanene og panelet deler (aria-controls og aria-labelledby). */
export function tabId(resultId: string): string {
  return `player-tab-${resultId}`;
}
export const PANEL_ID = "player-panel";

/**
 * Fanene per tjeneste paa bildet (FE-4, audit punkt 6): `role="tablist"`,
 * `role="tab"` og `aria-selected`, én tabstopp, og ←/→/Home/End flytter og
 * velger (stripKey). Navnet og statusen staar i fanen. Fanene brytes paa
 * smal skjerm.
 */
export function ResultTabs({
  results,
  currentId,
  onSelect,
}: {
  results: readonly AssignmentResult[];
  currentId: string;
  onSelect: (result: AssignmentResult) => void;
}) {
  const locale = useLocale();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    results.findIndex((r) => r.resultId === currentId),
    0
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const j = stripKey(e.key, current, results.length);
    if (j === null) return;
    e.preventDefault();
    onSelect(results[j]);
    refs.current[j]?.focus();
  };

  return (
    <div role="tablist" aria-label={t(locale, "player.tabsLabel")} className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
      {results.map((result, i) => {
        const selected = i === current;
        return (
          <button
            key={result.resultId}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(result.resultId)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(result)}
            className={`inline-flex min-h-11 max-w-full flex-col items-start justify-center rounded-button px-3 py-1.5 text-left text-sm ${
              selected ? "bg-primary text-on-primary" : "border border-line-strong bg-surface text-ink hover:bg-surface-2"
            } ${FOCUS}`}
          >
            <span className="max-w-full break-words font-medium">{resultLabel(locale, result)}</span>
            <span className={`text-xs ${selected ? "text-on-primary" : "text-ink-2"}`}>
              {t(locale, resultStatusKey(result.displayStatus, result.previousVersion))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
