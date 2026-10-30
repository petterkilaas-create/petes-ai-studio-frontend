"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import Link from "next/link";
import type { StaticImageData } from "next/image";
import { ArrowLeft, Check, ImageOff } from "lucide-react";
import { useAssignment } from "../../hooks/useAssignment";
import { resultStatusKey, type Assignment } from "../../lib/assignments";
import {
  browserStorage,
  itemKey,
  itemsForImage,
  loadDraft,
  removeItem,
  saveDraft,
  type BoardItem,
} from "../../lib/board";
import {
  activeResults,
  applySheet,
  badgeLabel,
  boardTotals,
  EMPTY_PANEL,
  imageName,
  indoorImages,
  mixedText,
  removeSheet,
  removeText,
  resultLabel,
  selectedText,
  selectRange,
  serviceNameKey,
  sheetButtons,
  sheetImages,
  sheetStart,
  toggleSelected,
  totalsText,
  withService,
  type PanelState,
  type SheetAction,
  type SheetStart,
  type SheetTarget,
} from "../../lib/brett";
import type { DuskStyle } from "../../lib/dusk";
import { orderCheckHref } from "../../lib/ordrer";
import { stripKey } from "../../lib/player";
import { ORDERS_PATH } from "../../lib/services";
import type { StylingStyle } from "../../lib/styling";
import { BoardPanel } from "./BoardPanel";
import { LoadState } from "./LoadState";
import { OrderProgress } from "./OrderProgress";
import { ServiceBadge } from "./ServiceBadge";
import { ServiceSheet } from "./ServiceSheet";
import { Button, ButtonLink } from "../ui/Button";
import { cardClass } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { FOCUS } from "../godkjenning/classes";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Bildebrettet (TG-NEW-277, FE-3 og FE-3b; skissen «Tjenester»): megleren
 * krysser av bilder (klikk, Shift-klikk, «Velg alle», tastatur) og legger
 * tjenester paa dem fra panelet. Hvert bildekort viser de valgte tjenestene
 * som merkelapper (trykk aapner valgene, «×» fjerner) og hva bildet har fra
 * foer. Et bilde uten tjeneste leveres som original.
 *
 * Valgene velges i et eget vindu (ServiceSheet), aapnet fra panelet for de
 * avkryssede bildene eller fra en merkelapp for det ene elementet. Det som
 * ble valgt sist (stilene, stemningen), huskes til neste gang (`memory`).
 * Utkastet lagres i localStorage ved hver endring (board.ts) og leses naar
 * ordren er hentet. Samme brett brukes for etterbestilling.
 *
 * Fremdriftslinja (Dag 59) er steg 2: den erstatter brettets egen faste
 * bunnlinje, med «Neste: kontroller» som hovedknapp og totalsText som
 * undertekst. Lenken oeverst gaar til ordrene (valg 2A).
 */

interface OpenSheet {
  target: SheetTarget;
  start: SheetStart;
}

export function ServiceBoard({
  assignmentId,
  duskImages,
  styleImages,
}: {
  assignmentId: string;
  duskImages: Record<DuskStyle, StaticImageData>;
  styleImages: Record<StylingStyle, StaticImageData>;
}) {
  const locale = useLocale();
  const [items, setItems] = useState<BoardItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [memory, setMemory] = useState<PanelState>(EMPTY_PANEL);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  // Fokus etter at vinduet er lukket eller en merkelapp er fjernet: knappen,
  // eller bildet naar knappen er borte (merkelappen ble byttet eller fjernet).
  const focusAfter = useRef<{ el: HTMLElement | null; imageId: string | null } | null>(null);

  useEffect(() => {
    const target = focusAfter.current;
    if (sheet !== null || target === null) return;
    focusAfter.current = null;
    if (target.el?.isConnected) target.el.focus();
    else if (target.imageId !== null) document.getElementById(tileId(target.imageId))?.focus();
  }, [sheet, items]);

  // Utkastet leses naar ordren er hentet: bare bildene som finnes naa.
  const onLoaded = useCallback(
    (assignment: Assignment) => {
      const draft = loadDraft(browserStorage(), assignmentId, assignment.images.map((img) => img.id));
      setItems(draft?.items ?? []);
    },
    [assignmentId]
  );
  const { load, reload } = useAssignment(assignmentId, onLoaded);

  function update(next: BoardItem[], message: string) {
    setItems(next);
    saveDraft(browserStorage(), assignmentId, next);
    setAnnouncement(message);
  }

  function select(next: string[]) {
    setSelected(next);
    setAnnouncement(selectedText(locale, next.length));
  }

  if (load.kind !== "ok") return <LoadState load={load} onRetry={() => void reload()} />;

  const { assignment } = load;
  const images = assignment.images;
  const order = images.map((img) => img.id);
  const totals = boardTotals(images, items);
  const n = selected.length;

  /** «1. Stue, 3. Fasade» for bildene, i rekkefoelgen paa brettet. */
  function namesOf(list: readonly string[]): string {
    const ids = new Set(list);
    return images
      .map((img, i) => (ids.has(img.id) ? imageName(img, i + 1) : null))
      .filter((x) => x !== null)
      .join(", ");
  }

  function onTileClick(e: MouseEvent<HTMLButtonElement>, id: string) {
    select(e.shiftKey ? selectRange(order, selected, anchor, id) : toggleSelected(selected, id));
    setAnchor(id);
  }

  function onTileKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = stripKey(e.key, index, images.length);
    if (next === null) return;
    e.preventDefault();
    document.getElementById(tileId(images[next].id))?.focus();
  }

  function openSheet(target: SheetTarget, from: HTMLElement) {
    opener.current = from;
    setSheet({ target, start: sheetStart(items, target, memory) });
  }

  function closeSheet() {
    if (sheet === null) return;
    focusAfter.current = { el: opener.current, imageId: sheet.target.kind === "item" ? sheet.target.imageId : null };
    setSheet(null);
  }

  function submit(panel: PanelState, action: SheetAction) {
    if (sheet === null) return;
    const next = applySheet(items, sheet.target, action, panel);
    if (next === null) return;
    const label = t(locale, serviceNameKey(sheet.target.service));
    update(next, action === "add" ? t(locale, "board.added", { label }) : t(locale, "board.updated"));
    setMemory(panel);
    closeSheet();
  }

  function removeFromSheet() {
    if (sheet === null) return;
    const label = t(locale, serviceNameKey(sheet.target.service));
    update(removeSheet(items, sheet.target), t(locale, "board.removed", { label }));
    closeSheet();
  }

  function removeBadge(item: BoardItem, label: string) {
    focusAfter.current = { el: null, imageId: item.imageId };
    update(removeItem(items, itemKey(item)), t(locale, "board.removed", { label }));
  }


  /** Linja under navnet i vinduet: hvilke bilder, eller hvilket element som endres. */
  function sheetIntro(target: SheetTarget): string {
    if (target.kind === "images") return t(locale, "board.sheet.for", { names: namesOf(target.imageIds) });
    const item = items.find((it) => itemKey(it) === target.key);
    const index = order.indexOf(target.imageId);
    const name = index < 0 ? "" : imageName(images[index], index + 1);
    return t(locale, "board.editing", { label: item === undefined ? "" : badgeLabel(locale, item), image: name });
  }

  const sheetIds = sheet === null ? [] : sheetImages(sheet.target);
  const sheetHas = sheet === null ? 0 : withService(items, sheetIds, sheet.target.service).length;
  const indoor = sheet?.target.service === "aarstid" ? indoorImages(images, items, sheetIds) : [];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <Link
        href={ORDERS_PATH}
        className={`mb-6 inline-flex min-h-11 items-center gap-2 rounded-button text-sm text-ink-2 hover:text-ink ${FOCUS}`}
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        {t(locale, "orders.back")}
      </Link>

      <div className="mb-8">
        <PageHeader title={t(locale, "board.title")} subtitle={<span className="break-words">{assignment.address}</span>} />
        <p className="mt-2 max-w-2xl text-sm text-ink-2">{t(locale, "board.subtitle")}</p>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {images.length === 0 ? (
        <p className="text-sm text-ink-2">{t(locale, "board.noImages")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="board-images-title" className="flex min-w-0 flex-col gap-4">
            <h2 id="board-images-title" className="sr-only">
              {t(locale, "board.images")}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => select([...order])} disabled={n === images.length}>
                {t(locale, "board.selectAll")}
              </Button>
              <Button variant="secondary" onClick={() => select([])} disabled={n === 0}>
                {t(locale, "board.clearSelection")}
              </Button>
            </div>
            <p className="text-[13px] text-ink-2">{t(locale, "board.selectHint")}</p>

            <ul className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {images.map((image, i) => {
                const name = imageName(image, i + 1);
                const on = selected.includes(image.id);
                const chosen = itemsForImage(items, image.id);
                const before = activeResults(image);
                return (
                  <li key={image.id} className={cardClass("none", `flex min-w-0 flex-col gap-2 p-2 ${on ? "ring-2 ring-ink" : ""}`)}>
                    <button
                      id={tileId(image.id)}
                      type="button"
                      aria-pressed={on}
                      onClick={(e) => onTileClick(e, image.id)}
                      onKeyDown={(e) => onTileKey(e, i)}
                      className={`flex w-full flex-col gap-2 rounded-button text-left ${FOCUS}`}
                    >
                      <span className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-button bg-surface-2">
                        {image.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff aria-hidden className="size-6 text-ink-2" strokeWidth={1.75} />
                        )}
                        <span
                          aria-hidden
                          className={`absolute left-2 top-2 flex size-6 items-center justify-center rounded-md border-2 ${
                            on ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-surface"
                          }`}
                        >
                          {on && <Check className="size-4" strokeWidth={2.6} />}
                        </span>
                      </span>
                      <span className="min-w-0 break-words px-1 text-sm font-medium text-ink">{name}</span>
                    </button>

                    {chosen.length > 0 && (
                      <ul className="flex flex-wrap gap-x-1.5 gap-y-2 px-1">
                        {chosen.map((item) => {
                          const label = badgeLabel(locale, item);
                          const key = itemKey(item);
                          return (
                            <ServiceBadge
                              key={key}
                              label={label}
                              openLabel={t(locale, "board.editItem", { label, image: name })}
                              removeLabel={t(locale, "board.removeItem", { label, image: name })}
                              onOpen={(from) => openSheet({ kind: "item", service: item.service, imageId: image.id, key }, from)}
                              onRemove={() => removeBadge(item, label)}
                            />
                          );
                        })}
                      </ul>
                    )}

                    {before.length > 0 && (
                      <div className="px-1">
                        <p className="text-[13px] text-ink-2">{t(locale, "board.hasBefore")}</p>
                        <ul className="flex flex-col gap-0.5 text-[13px] text-ink-2">
                          {before.map((r) => (
                            <li key={r.resultId}>
                              {resultLabel(locale, r)} · {t(locale, resultStatusKey(r.displayStatus, r.previousVersion))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {chosen.length === 0 && before.length === 0 && (
                      <p className="px-1 text-[13px] text-ink-2">{t(locale, "assignment.status.originalOnly")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="board-panel-title" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <div className={cardClass("sm")}>
              <h2 id="board-panel-title" className="text-lg font-medium text-ink">
                {selectedText(locale, n)}
              </h2>
              <p className="mt-1 break-words text-[13px] text-ink-2">
                {n === 0 ? t(locale, "board.selectFirst") : namesOf(selected)}
              </p>
              <BoardPanel
                items={items}
                selected={selected}
                onOpen={(service, from) =>
                  openSheet({ kind: "images", service, imageIds: order.filter((id) => selected.includes(id)) }, from)
                }
              />
            </div>
          </section>
        </div>
      )}

      {sheet !== null && (
        <ServiceSheet
          service={sheet.target.service}
          buttons={sheetButtons(locale, sheet.start.mode, sheetIds.length, sheetHas)}
          remove={removeText(locale, sheetIds.length, sheetHas)}
          start={sheet.start.panel}
          intro={sheetIntro(sheet.target)}
          mixed={sheet.start.mixed ? mixedText(locale, items, sheetIds, sheet.target.service) : null}
          indoor={indoor.length > 0 ? namesOf(indoor.map((img) => img.id)) : null}
          duskImages={duskImages}
          styleImages={styleImages}
          onSubmit={submit}
          onRemove={removeFromSheet}
          onClose={closeSheet}
        />
      )}

      <OrderProgress
        page="services"
        assignment={assignment}
        draftCount={items.length}
        servicesNow={totalsText(locale, totals)}
        primary={
          items.length === 0 ? (
            <Button disabled>{t(locale, "board.next")}</Button>
          ) : (
            <ButtonLink href={orderCheckHref(assignmentId)}>{t(locale, "board.next")}</ButtonLink>
          )
        }
      />
    </main>
  );
}

function tileId(imageId: string): string {
  return `board-tile-${imageId}`;
}
