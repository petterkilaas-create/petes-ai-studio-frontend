"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { StaticImageData } from "next/image";
import { TriangleAlert, X } from "lucide-react";
import type { BoardService } from "../../lib/board";
import {
  boardImageTypeChoices,
  panelChoices,
  panelMissing,
  serviceNameKey,
  type PanelState,
  type SheetAction,
  type SheetButton,
} from "../../lib/brett";
import type { DuskStyle } from "../../lib/dusk";
import type { StylingStyle } from "../../lib/styling";
import { DuskChoicePicker } from "../DuskChoicePicker";
import { ImageTypeChoice } from "../ImageTypeChoice";
import { StylingChoicePicker } from "../StylingChoicePicker";
import { AarstidChoicePicker } from "../AarstidChoicePicker";
import { Button } from "../ui/Button";
import { FOCUS } from "../godkjenning/classes";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Valgene for én tjeneste i et eget vindu fra hoeyre (FE-3b; Petter 30.10):
 * dagens velgere fra Tjenester i full bredde (`inDialog`: kortene i
 * auto-fill, saa tekst aldri brytes midt i ord). En <dialog> med showModal(),
 * som moodboardet: Esc lukker, fokusfelle, oeverste lag. Bredde
 * min(720px, 100vw), fullskjerm paa mobil. Nederst «Legg til på N bilder»
 * eller «Oppdater N bilder» (har bare noen av bildene tjenesten: «Oppdater
 * de N som har den» og «Legg til på alle M»), «Avbryt», og den dempede
 * «Fjern fra de N bildene» naar noen har den.
 *
 * Valgene holdes her til megleren trykker knappen; Avbryt og Esc forkaster
 * dem. Siden setter fokus tilbake paa knappen som aapnet vinduet (onClose).
 */
export function ServiceSheet({
  service,
  buttons,
  remove,
  start,
  intro,
  mixed,
  indoor,
  duskImages,
  styleImages,
  onSubmit,
  onRemove,
  onClose,
}: {
  service: BoardService;
  /** Knappene for valgene (sheetButtons); den foerste er primaer. */
  buttons: readonly SheetButton[];
  /** «Fjern fra de 2 bildene», eller null naar ingen av bildene har tjenesten. */
  remove: string | null;
  start: PanelState;
  /** «Gjelder 1. Stue, 2. Kjøkken.», eller «Du endrer … på …» for merkelappen. */
  intro: string;
  /** «Ulike stiler nå: …» naar bildene har ulike valg (ingenting forhaandsvalgt). */
  mixed: string | null;
  /** Navnene paa bildene som ser ut til aa vaere tatt inne (bare Årstider), eller null. */
  indoor: string | null;
  duskImages: Record<DuskStyle, StaticImageData>;
  styleImages: Record<StylingStyle, StaticImageData>;
  onSubmit: (panel: PanelState, action: SheetAction) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const locale = useLocale();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const [panel, setPanel] = useState<PanelState>(start);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    dialog.showModal();
    const close = () => onCloseRef.current();
    dialog.addEventListener("close", close);
    return () => {
      dialog.removeEventListener("close", close);
      if (dialog.open) dialog.close();
    };
  }, []);

  const complete = panelChoices(service, panel) !== null;
  const missing = panelMissing(locale, service, panel);
  const imageTypes = boardImageTypeChoices(service);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-0 ml-auto h-dvh max-h-none w-[min(720px,100vw)] max-w-none overflow-hidden overscroll-contain bg-paper p-0 text-ink backdrop:bg-ink/60"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1 pt-2">
            <h2 id={titleId} className="text-lg font-medium text-ink">
              {t(locale, serviceNameKey(service))}
            </h2>
            <p className="mt-1 break-words text-[13px] text-ink-2">{intro}</p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t(locale, "board.sheet.close")}
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink hover:bg-surface-2 ${FOCUS}`}
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {mixed !== null && (
            <div className="mb-5 rounded-button bg-amber-bg px-3 py-2 text-[13px] text-amber-fg">
              <p className="font-medium">{mixed}</p>
              <p>{t(locale, "board.sheet.mixed")}</p>
            </div>
          )}
          {service === "aarstid" && <p className="mb-5 text-sm text-ink">{t(locale, "board.sheet.aarstidNote")}</p>}

          <div className="flex flex-col gap-6">
            {service === "skumring" && (
              <DuskChoicePicker
                value={panel.dusk}
                onChange={(dusk) => setPanel({ ...panel, dusk })}
                disabled={false}
                images={duskImages}
                inDialog
                locale={locale}
              />
            )}
            {service === "skumring" && imageTypes.length > 0 && (
              <ImageTypeChoice
                choices={imageTypes}
                value={panel.duskImageType}
                onChange={(duskImageType) => setPanel({ ...panel, duskImageType })}
                disabled={false}
                locale={locale}
              />
            )}
            {service === "klart_vaer" && imageTypes.length > 0 && (
              <ImageTypeChoice
                choices={imageTypes}
                value={panel.skyImageType}
                onChange={(skyImageType) => setPanel({ ...panel, skyImageType })}
                disabled={false}
                locale={locale}
              />
            )}
            {service === "styling" && (
              <StylingChoicePicker
                value={panel.styling}
                onChange={(styling) => setPanel({ ...panel, styling })}
                disabled={false}
                images={styleImages}
                inDialog
                locale={locale}
              />
            )}
            {service === "aarstid" && (
              <AarstidChoicePicker
                value={panel.aarstid}
                onChange={(aarstid) => setPanel({ ...panel, aarstid })}
                disabled={false}
                locale={locale}
              />
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-line bg-surface px-4 py-3 sm:px-6">
          {indoor !== null && (
            <p className="mb-3 flex gap-2 rounded-button bg-amber-bg px-3 py-2 text-[13px] text-amber-fg" role="status">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
              <span className="min-w-0 break-words">{t(locale, "board.sheet.indoor", { names: indoor })}</span>
            </p>
          )}
          {/* Alltid i treet, saa skjermleseren leser hva som mangler naar det endres. */}
          <p className={`text-[13px] text-ink-2${missing ? " mb-2" : ""}`} aria-live="polite">
            {missing}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {buttons.map((button, i) => (
              <Button
                key={button.action}
                variant={i === 0 ? "primary" : "secondary"}
                onClick={() => onSubmit(panel, button.action)}
                disabled={!complete}
              >
                {button.text}
              </Button>
            ))}
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              {t(locale, "board.cancel")}
            </Button>
            {remove !== null && (
              <button
                type="button"
                onClick={onRemove}
                className={`ml-auto inline-flex min-h-11 items-center rounded-button px-3 text-sm text-ink-2 underline underline-offset-2 hover:text-ink ${FOCUS}`}
              >
                {remove}
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
