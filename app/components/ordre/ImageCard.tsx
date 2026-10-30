"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEventHandler } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { GripVertical, ImageOff, MoreHorizontal } from "lucide-react";
import type { AssignmentImage } from "../../lib/assignments";
import { canRemove, MOVE_ACTIONS, normalizeRoom, ROOM_MAX, type MoveAction } from "../../lib/ordrer";
import { ResultList } from "./ResultList";
import { buttonClass } from "../ui/Button";
import { cardClass } from "../ui/Card";
import { FOCUS } from "../godkjenning/classes";
import { codeText, t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Ett bilde i ordren (FE-2): miniatyren, nummeret og filnavnet, rommet (lagres
 * naar feltet forlates eller med Enter) og «Fjern» (bare uten resultater, K
 * 2.6). Kallene ligger hos forelderen; de gir en feilkode (`assignmentError`)
 * eller null tilbake. Knappene er minst 44 px. Under staar resultatene paa
 * bildet (FE-3, ResultList), i hele kortets bredde (FE-3c).
 *
 * Rekkefoelgen (FE-3 tillegg, Petter 30.10): kortet dras med dnd-kit. Paa PC
 * kan hele kortet dras med musa (ikke fra feltet eller knappene); med finger og
 * tastatur brukes haandtaket (mellomrom loefter, piltastene flytter,
 * mellomrom slipper, Esc avbryter). Uten aa dra: menyen «⋯» med «Flytt
 * først/opp/ned/sist» (WCAG 2.5.7).
 */

export type ImageAction = Promise<string | null>;

/** Id-en til menyknappen, saa forelderen kan sette fokus tilbake etter flyttingen. */
export function menuButtonId(imageId: string): string {
  return `order-menu-${imageId}`;
}

const ICON_BUTTON = `inline-flex size-11 shrink-0 items-center justify-center rounded-button text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;
const MENU_ITEM = `flex min-h-11 w-full items-center rounded-button px-3 text-left text-sm text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

export function ImageCard({
  assignmentId,
  image,
  number,
  count,
  onRoom,
  onMove,
  onRemove,
}: {
  /** Ordren, som «Åpne» tar med til godkjenningssiden (`?fra=`, FE-3c). */
  assignmentId: string;
  image: AssignmentImage;
  /** Plassen i lista (1..n), som vises. */
  number: number;
  /** Antall bilder (menyvalgene ytterst er av). */
  count: number;
  onRoom: (room: string | null) => ImageAction;
  onMove: (action: MoveAction) => void;
  onRemove: () => ImageAction;
}) {
  const locale = useLocale();
  const [draft, setDraft] = useState(image.room ?? "");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const roomId = `order-room-${image.id}`;
  const menuId = `order-menu-list-${image.id}`;
  const removable = canRemove(image);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });
  // Musa paa hele kortet; finger og tastatur bare paa haandtaket (ellers loefter mellomrom i feltet kortet).
  const { onMouseDown, ...handleListeners } = listeners ?? {};
  // Bare flytting (ikke skalering), som CSS.Translate i @dnd-kit/utilities, som ikke er en egen avhengighet.
  const translate = transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined;

  // Fokus: «Behold» naar spoersmaalet vises (det trygge valget), og tilbake
  // til «Fjern» naar det lukkes uten at bildet ble fjernet.
  const keepRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const askedRef = useRef(false);
  useEffect(() => {
    if (confirming) {
      askedRef.current = true;
      keepRef.current?.focus();
    } else if (askedRef.current) {
      askedRef.current = false;
      removeRef.current?.focus();
    }
  }, [confirming]);

  // Menyen: foerste valg faar fokus naar den aapnes; Esc og klikk utenfor lukker.
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && e.target !== menuButtonRef.current) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key === "Tab") {
      setMenuOpen(false);
    }
  }

  function chooseMove(action: MoveAction) {
    setMenuOpen(false);
    onMove(action);
  }

  function moveDisabled(action: MoveAction): boolean {
    return action === "first" || action === "up" ? number <= 1 : number >= count;
  }

  async function saveRoom() {
    const room = normalizeRoom(draft);
    if (saving || room === image.room) return;
    setSaving(true);
    setErrorCode(null);
    const code = await onRoom(room);
    setSaving(false);
    setErrorCode(code);
    if (code === null) setDraft(room ?? "");
  }

  function onRoomKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveRoom();
    } else if (e.key === "Escape") {
      setDraft(image.room ?? "");
    }
  }

  async function remove() {
    setRemoving(true);
    setErrorCode(null);
    const code = await onRemove();
    // Ved suksess er kortet borte; ellers vises feilen og spoersmaalet lukkes.
    setRemoving(false);
    setConfirming(false);
    setErrorCode(code);
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: translate, transition }}
      onMouseDown={onMouseDown as MouseEventHandler<HTMLLIElement> | undefined}
      className={cardClass(
        "none",
        `relative flex min-w-0 flex-col gap-3 p-3 ${isDragging ? "z-10 border-dashed border-line-strong bg-surface-2 opacity-60" : ""}`
      )}
    >
      <div className="flex gap-3">
        <button
          ref={setActivatorNodeRef}
          type="button"
          data-drag-handle=""
          {...attributes}
          {...handleListeners}
          aria-label={t(locale, "orders.dragHandle", { n: number })}
          className={`${ICON_BUTTON} -ml-1 cursor-grab touch-none self-start active:cursor-grabbing`}
        >
          <GripVertical aria-hidden className="size-5" strokeWidth={1.75} />
        </button>

        <span className="flex aspect-[4/3] w-24 shrink-0 items-center justify-center self-start overflow-hidden rounded-button bg-surface-2 sm:w-32">
          {image.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.thumbUrl}
              alt={t(locale, "orders.imageAlt", { n: number })}
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              <ImageOff aria-hidden className="size-5 text-ink-2" strokeWidth={1.75} />
              <span className="sr-only">{t(locale, "orders.thumbMissing")}</span>
            </>
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start gap-2">
            <p className="flex min-w-0 flex-1 items-baseline gap-2 pt-3 text-sm">
              <span className="font-medium text-ink">{number}.</span>
              <span className="truncate text-ink-2">{image.fileName}</span>
            </p>
            <div className="relative">
              <button
                ref={menuButtonRef}
                id={menuButtonId(image.id)}
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                aria-label={t(locale, "orders.moveMenu", { n: number })}
                className={ICON_BUTTON}
              >
                <MoreHorizontal aria-hidden className="size-5" strokeWidth={1.75} />
              </button>
              {menuOpen && (
                <div
                  ref={menuRef}
                  id={menuId}
                  role="menu"
                  aria-label={t(locale, "orders.moveMenu", { n: number })}
                  onKeyDown={onMenuKey}
                  className="absolute right-0 top-12 z-20 w-44 rounded-button border border-line bg-surface p-1"
                >
                  {MOVE_ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      role="menuitem"
                      onClick={() => chooseMove(action)}
                      disabled={moveDisabled(action)}
                      className={MENU_ITEM}
                    >
                      {t(locale, `orders.move.${action}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label htmlFor={roomId} className="sr-only">
              {t(locale, "orders.room")}
            </label>
            <input
              id={roomId}
              type="text"
              maxLength={ROOM_MAX}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void saveRoom()}
              onKeyDown={onRoomKey}
              placeholder={t(locale, "orders.roomExample")}
              aria-busy={saving}
              className={`block w-full min-h-11 rounded-button border border-line-strong bg-surface px-3 py-2 text-sm text-ink ${FOCUS}`}
            />
            {saving && <p className="mt-1 text-[13px] text-ink-2">{t(locale, "orders.roomSaving")}</p>}
          </div>

          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-sm text-ink">{t(locale, "orders.removeAsk")}</p>
              <button type="button" onClick={() => void remove()} disabled={removing} className={buttonClass("danger")}>
                {t(locale, "orders.removeConfirm")}
              </button>
              <button
                ref={keepRef}
                type="button"
                onClick={() => setConfirming(false)}
                disabled={removing}
                className={buttonClass("secondary")}
              >
                {t(locale, "orders.removeCancel")}
              </button>
            </div>
          ) : removable ? (
            <div className="flex flex-wrap items-center gap-2">
              <button ref={removeRef} type="button" onClick={() => setConfirming(true)} className={buttonClass("secondary")}>
                {t(locale, "orders.remove")}
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">{t(locale, "orders.removeLocked")}</p>
          )}

          {errorCode !== null && (
            <p className="text-sm text-red-fg" role="alert">
              {codeText(locale, "assignmentError", errorCode)}
            </p>
          )}
        </div>
      </div>

      <ResultList results={image.results} number={number} assignmentId={assignmentId} />
    </li>
  );
}
