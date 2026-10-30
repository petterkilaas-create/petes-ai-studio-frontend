"use client";

import type { BoardItem, BoardService } from "../../lib/board";
import { boardServices, serviceDescKey, serviceNameKey, serviceRow } from "../../lib/brett";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Panelet paa bildebrettet (FE-3b; skissen «Tjenester»): én kompakt rad per
 * tjeneste med navn, én linje tekst, statusen for de avkryssede bildene
 * («Ikke lagt til», «På 1 av 2», «På alle 2»), «Ulike stiler nå: …» naar
 * bildene har ulike valg, og én knapp: «Legg til…» eller «Endre…». Knappen
 * aapner valgene i et eget vindu (ServiceSheet); ingen velgere her. Uten
 * avkryssede bilder er knappene av.
 */
export function BoardPanel({
  items,
  selected,
  onOpen,
}: {
  items: readonly BoardItem[];
  selected: readonly string[];
  /** Aapner vinduet; knappen faar fokus tilbake naar det lukkes. */
  onOpen: (service: BoardService, opener: HTMLElement) => void;
}) {
  const locale = useLocale();
  const n = selected.length;
  return (
    <ul className="mt-2 flex flex-col">
      {boardServices().map((service) => {
        const row = serviceRow(locale, items, selected, service);
        const name = t(locale, serviceNameKey(service));
        return (
          <li key={service} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{name}</p>
              <p className="text-[13px] text-ink-2">{t(locale, serviceDescKey(service))}</p>
              {row.status !== null && (
                <div className="mt-1.5">
                  <Pill tone={row.coverage === "all" ? "green" : row.coverage === "some" ? "amber" : "neutral"}>
                    {row.status}
                  </Pill>
                </div>
              )}
              {row.mixed !== null && <p className="mt-1.5 text-[13px] text-amber-fg">{row.mixed}</p>}
            </div>
            <Button
              variant="secondary"
              className="shrink-0 px-4"
              onClick={(e) => onOpen(service, e.currentTarget)}
              disabled={n === 0}
              aria-label={t(locale, row.action === "add" ? "board.rowAddLabel" : "board.rowEditLabel", { service: name })}
            >
              {t(locale, row.action === "add" ? "board.rowAdd" : "board.rowEdit")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
