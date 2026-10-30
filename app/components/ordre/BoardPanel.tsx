"use client";

import type { StaticImageData } from "next/image";
import type { BoardItem, BoardService } from "../../lib/board";
import { coverage } from "../../lib/board";
import {
  addButtonText,
  boardImageTypeChoices,
  boardServices,
  coverageText,
  panelChoices,
  panelMissing,
  serviceDescKey,
  serviceNameKey,
  type PanelState,
} from "../../lib/brett";
import type { DuskStyle } from "../../lib/dusk";
import type { StylingStyle } from "../../lib/styling";
import { DuskChoicePicker } from "../DuskChoicePicker";
import { ImageTypeChoice } from "../ImageTypeChoice";
import { StylingChoicePicker } from "../StylingChoicePicker";
import { AarstidChoicePicker } from "../AarstidChoicePicker";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Panelet paa bildebrettet (FE-3; skissen «Tjenester»): én rad per tjeneste
 * med statusen for de avkryssede bildene («Lagt til på 2 av 3»), og valgene
 * naar raden er aapen. Valgene er dagens velgere fra Tjenester, og «Legg til»
 * gir elementene med feltene i K 2.7 (panelChoices i brett.ts). Ved «Endre»
 * paa et bilde er `editing` satt, og knappen lagrer endringen i stedet.
 */
export function BoardPanel({
  items,
  selected,
  panel,
  open,
  editing,
  duskImages,
  styleImages,
  onPanel,
  onOpen,
  onAdd,
  onRemove,
  onSaveEdit,
  onCancelEdit,
}: {
  items: readonly BoardItem[];
  selected: readonly string[];
  panel: PanelState;
  open: BoardService | null;
  editing: { service: BoardService; label: string; name: string } | null;
  duskImages: Record<DuskStyle, StaticImageData>;
  styleImages: Record<StylingStyle, StaticImageData>;
  onPanel: (panel: PanelState) => void;
  onOpen: (service: BoardService | null) => void;
  onAdd: (service: BoardService) => void;
  onRemove: (service: BoardService) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const locale = useLocale();
  const n = selected.length;
  return (
    <ul className="flex flex-col">
      {boardServices().map((service) => {
        const state = coverage(items, selected, service);
        const has = new Set(items.filter((it) => it.service === service).map((it) => it.imageId));
        const hasCount = selected.filter((id) => has.has(id)).length;
        const isOpen = open === service;
        const isEditing = editing !== null && editing.service === service;
        const bodyId = `board-panel-${service}`;
        const complete = panelChoices(service, panel) !== null;
        const missing = panelMissing(locale, service, panel);
        const imageTypes = boardImageTypeChoices(service);
        return (
          <li key={service} className="border-b border-line py-4 last:border-b-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t(locale, serviceNameKey(service))}</p>
                <p className="text-[13px] text-ink-2">{t(locale, serviceDescKey(service))}</p>
              </div>
              {n > 0 && (
                <Pill tone={state === "all" ? "green" : state === "some" ? "amber" : "neutral"}>
                  {coverageText(locale, state, hasCount, n)}
                </Pill>
              )}
              <Button
                variant="secondary"
                onClick={() => onOpen(isOpen ? null : service)}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                disabled={n === 0 && !isEditing}
              >
                {t(locale, isOpen ? "board.close" : "board.open")}
              </Button>
            </div>

            {isOpen && (
              <div id={bodyId} className="mt-4 flex flex-col gap-4">
                {isEditing ? (
                  <p className="text-sm text-ink" role="status">
                    {t(locale, "board.editing", { label: editing.label, image: editing.name })}
                  </p>
                ) : (
                  n > 1 && <p className="text-[13px] text-ink-2">{t(locale, "board.appliesToAll", { n })}</p>
                )}

                {service === "skumring" && (
                  <DuskChoicePicker
                    value={panel.dusk}
                    onChange={(dusk) => onPanel({ ...panel, dusk })}
                    disabled={false}
                    images={duskImages}
                    compact
                    locale={locale}
                  />
                )}
                {service === "skumring" && imageTypes.length > 0 && (
                  <ImageTypeChoice
                    choices={imageTypes}
                    value={panel.duskImageType}
                    onChange={(duskImageType) => onPanel({ ...panel, duskImageType })}
                    disabled={false}
                    locale={locale}
                  />
                )}
                {service === "klart_vaer" && imageTypes.length > 0 && (
                  <ImageTypeChoice
                    choices={imageTypes}
                    value={panel.skyImageType}
                    onChange={(skyImageType) => onPanel({ ...panel, skyImageType })}
                    disabled={false}
                    locale={locale}
                  />
                )}
                {service === "styling" && (
                  <StylingChoicePicker
                    value={panel.styling}
                    onChange={(styling) => onPanel({ ...panel, styling })}
                    disabled={false}
                    images={styleImages}
                    locale={locale}
                  />
                )}
                {service === "aarstid" && (
                  <AarstidChoicePicker
                    value={panel.aarstid}
                    onChange={(aarstid) => onPanel({ ...panel, aarstid })}
                    disabled={false}
                    locale={locale}
                  />
                )}

                {missing !== null && (
                  <p className="text-[13px] text-ink-2" aria-live="polite">
                    {missing}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button onClick={onSaveEdit} disabled={!complete}>
                        {t(locale, "board.saveEdit")}
                      </Button>
                      <Button variant="secondary" onClick={onCancelEdit}>
                        {t(locale, "board.cancelEdit")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => onAdd(service)} disabled={n === 0 || !complete}>
                        {addButtonText(locale, n, hasCount)}
                      </Button>
                      {hasCount > 0 && (
                        <Button variant="secondary" onClick={() => onRemove(service)}>
                          {n === 1 ? t(locale, "board.removeOne") : t(locale, "board.removeMany", { n: hasCount })}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
