"use client";

import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
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
  removeFromImages,
  removeItem,
  replaceItem,
  saveDraft,
  type BoardItem,
  type BoardService,
} from "../../lib/board";
import {
  activeResults,
  addChoices,
  boardTotals,
  EMPTY_PANEL,
  imageName,
  itemLabel,
  panelChoices,
  panelForNewSelection,
  panelFromItem,
  resultLabel,
  selectedText,
  selectRange,
  serviceNameKey,
  toggleSelected,
  totalsText,
  type PanelState,
} from "../../lib/brett";
import type { DuskStyle } from "../../lib/dusk";
import { orderCheckHref, orderImagesHref } from "../../lib/ordrer";
import { stripKey } from "../../lib/player";
import type { StylingStyle } from "../../lib/styling";
import { BoardPanel } from "./BoardPanel";
import { LoadState } from "./LoadState";
import { Button, ButtonLink } from "../ui/Button";
import { cardClass } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { FOCUS } from "../godkjenning/classes";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Bildebrettet (TG-NEW-277, FE-3; skissen «Tjenester»): megleren krysser av
 * bilder (klikk, Shift-klikk, «Velg alle», tastatur) og legger tjenester paa
 * dem i panelet. Hvert bilde viser hva som er valgt, med «Endre» og «Fjern»,
 * og hva det har fra foer. Et bilde uten tjeneste leveres som original.
 * Utkastet lagres i localStorage ved hver endring (board.ts) og leses naar
 * ordren er hentet. Samme brett brukes for etterbestilling.
 */

interface Editing {
  key: string;
  service: BoardService;
  label: string;
  name: string;
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
  const [panel, setPanel] = useState<PanelState>(EMPTY_PANEL);
  const [open, setOpen] = useState<BoardService | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const panelRef = useRef<HTMLHeadingElement>(null);

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

  // Ny avkrysning: det som gjelder bildet, maa velges paa nytt (brett.ts), og en endring avbrytes.
  function select(next: string[]) {
    setSelected(next);
    setPanel((p) => panelForNewSelection(p));
    setEditing(null);
    setAnnouncement(selectedText(locale, next.length));
  }

  if (load.kind !== "ok") return <LoadState load={load} onRetry={() => void reload()} />;

  const { assignment } = load;
  const images = assignment.images;
  const order = images.map((img) => img.id);
  const totals = boardTotals(images, items);
  const n = selected.length;

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

  function add(service: BoardService) {
    const choices = panelChoices(service, panel);
    if (choices === null || n === 0) return;
    update(addChoices(items, selected, choices), t(locale, "board.added", { label: t(locale, serviceNameKey(service)) }));
  }

  function removeService(service: BoardService) {
    update(removeFromImages(items, selected, service), t(locale, "board.removed", { label: t(locale, serviceNameKey(service)) }));
  }

  function startEdit(item: BoardItem, name: string) {
    setSelected([item.imageId]);
    setAnchor(item.imageId);
    setPanel(panelFromItem(item, panelForNewSelection(panel)));
    setOpen(item.service);
    setEditing({ key: itemKey(item), service: item.service, label: itemLabel(locale, item), name });
    panelRef.current?.scrollIntoView({ block: "start" });
    panelRef.current?.focus();
  }

  function saveEdit() {
    if (editing === null) return;
    const choices = panelChoices(editing.service, panel);
    if (choices === null) return;
    update(replaceItem(items, editing.key, choices), t(locale, "board.updated"));
    setEditing(null);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 pb-32 md:px-8 md:py-12">
      <Link
        href={orderImagesHref(assignmentId)}
        className={`mb-6 inline-flex min-h-11 items-center gap-2 rounded-button text-sm text-ink-2 hover:text-ink ${FOCUS}`}
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        {t(locale, "board.back")}
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
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <section aria-labelledby="board-images-title" className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="board-images-title" className="mr-auto text-lg font-medium text-ink">
                {selectedText(locale, n)}
              </h2>
              <Button variant="secondary" onClick={() => select([...order])} disabled={n === images.length}>
                {t(locale, "board.selectAll")}
              </Button>
              <Button variant="secondary" onClick={() => select([])} disabled={n === 0}>
                {t(locale, "board.clearSelection")}
              </Button>
            </div>
            <p className="text-[13px] text-ink-2">{t(locale, "board.selectHint")}</p>

            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {images.map((image, i) => {
                const name = imageName(image, i + 1);
                const on = selected.includes(image.id);
                const chosen = itemsForImage(items, image.id);
                const before = activeResults(image);
                return (
                  <li key={image.id} className={cardClass("none", `flex flex-col gap-3 p-3 ${on ? "ring-2 ring-ink" : ""}`)}>
                    <button
                      id={tileId(image.id)}
                      type="button"
                      aria-pressed={on}
                      onClick={(e) => onTileClick(e, image.id)}
                      onKeyDown={(e) => onTileKey(e, i)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-button text-left ${FOCUS}`}
                    >
                      <span className="relative flex aspect-[4/3] w-24 shrink-0 items-center justify-center overflow-hidden rounded-button bg-surface-2">
                        {image.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff aria-hidden className="size-5 text-ink-2" strokeWidth={1.75} />
                        )}
                        <span
                          aria-hidden
                          className={`absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-md border-2 ${
                            on ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-surface"
                          }`}
                        >
                          {on && <Check className="size-4" strokeWidth={2.6} />}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink">{name}</span>
                    </button>

                    {chosen.length > 0 && (
                      <div>
                        <p className="mb-1 text-[13px] text-ink-2">{t(locale, "board.chosen")}</p>
                        <ul className="flex flex-col gap-1">
                          {chosen.map((item) => {
                            const label = itemLabel(locale, item);
                            const key = itemKey(item);
                            return (
                              <li key={key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="min-w-0 flex-1 text-sm text-ink">{label}</span>
                                <Button
                                  variant="secondary"
                                  className="px-3"
                                  onClick={() => startEdit(item, name)}
                                  aria-label={t(locale, "board.editItem", { label, image: name })}
                                >
                                  {t(locale, "board.edit")}
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="px-3"
                                  onClick={() => update(removeItem(items, key), t(locale, "board.removed", { label }))}
                                  aria-label={t(locale, "board.removeItem", { label, image: name })}
                                >
                                  {t(locale, "board.remove")}
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {before.length > 0 && (
                      <div>
                        <p className="mb-1 text-[13px] text-ink-2">{t(locale, "board.hasBefore")}</p>
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
                      <p className="text-[13px] text-ink-2">{t(locale, "assignment.status.originalOnly")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="board-panel-title" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <div className={cardClass("sm")}>
              <h2
                id="board-panel-title"
                ref={panelRef}
                tabIndex={-1}
                className={`scroll-mt-6 rounded-button text-lg font-medium text-ink ${FOCUS}`}
              >
                {selectedText(locale, n)}
              </h2>
              <p className="mt-1 break-words text-[13px] text-ink-2">
                {n === 0
                  ? t(locale, "board.selectFirst")
                  : images
                      .map((img, i) => (selected.includes(img.id) ? imageName(img, i + 1) : null))
                      .filter((x) => x !== null)
                      .join(", ")}
              </p>
              <BoardPanel
                items={items}
                selected={selected}
                panel={panel}
                open={open}
                editing={editing}
                duskImages={duskImages}
                styleImages={styleImages}
                onPanel={setPanel}
                onOpen={setOpen}
                onAdd={add}
                onRemove={removeService}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditing(null)}
              />
            </div>
          </section>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-8">
          <p className="mr-auto min-w-0 text-[13px] text-ink-2">
            {totalsText(locale, totals)}
          </p>
          {items.length === 0 ? (
            <Button disabled>{t(locale, "board.next")}</Button>
          ) : (
            <ButtonLink href={orderCheckHref(assignmentId)}>{t(locale, "board.next")}</ButtonLink>
          )}
        </div>
      </div>
    </main>
  );
}

function tileId(imageId: string): string {
  return `board-tile-${imageId}`;
}
