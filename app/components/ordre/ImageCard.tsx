"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, ImageOff } from "lucide-react";
import type { AssignmentImage } from "../../lib/assignments";
import { canRemove, normalizeRoom, ROOM_MAX } from "../../lib/ordrer";
import { buttonClass } from "../ui/Button";
import { cardClass } from "../ui/Card";
import { FOCUS } from "../godkjenning/classes";
import { codeText, t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Ett bilde i ordren (FE-2): miniatyren, nummeret og filnavnet, rommet (lagres
 * naar feltet forlates eller med Enter), flytt opp/ned og «Fjern» (bare uten
 * resultater, K 2.6). Kallene ligger hos forelderen; de gir en feilkode
 * (`assignmentError`) eller null tilbake. Knappene er minst 44 px.
 */

export type ImageAction = Promise<string | null>;

/** Id-en til flytteknappen, saa forelderen kan sette fokus tilbake etter flyttingen. */
export function moveButtonId(imageId: string, dir: "up" | "down"): string {
  return `order-move-${dir}-${imageId}`;
}

const ICON_BUTTON = `inline-flex size-11 items-center justify-center rounded-button border border-line-strong bg-surface text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

export function ImageCard({
  image,
  number,
  first,
  last,
  onRoom,
  onMove,
  onRemove,
}: {
  image: AssignmentImage;
  /** Plassen i lista (1..n), som vises. */
  number: number;
  first: boolean;
  last: boolean;
  onRoom: (room: string | null) => ImageAction;
  onMove: (dir: "up" | "down") => ImageAction;
  onRemove: () => ImageAction;
}) {
  const locale = useLocale();
  const [draft, setDraft] = useState(image.room ?? "");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const roomId = `order-room-${image.id}`;
  const removable = canRemove(image);

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

  async function move(dir: "up" | "down") {
    setErrorCode(await onMove(dir));
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
    <li className={cardClass("none", "flex gap-3 p-3")}>
      <span className="flex aspect-[4/3] w-24 shrink-0 items-center justify-center overflow-hidden rounded-button bg-surface-2 sm:w-32">
        {image.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.thumbUrl}
            alt={t(locale, "orders.imageAlt", { n: number })}
            loading="lazy"
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
        <p className="flex min-w-0 items-baseline gap-2 text-sm">
          <span className="font-medium text-ink">{number}.</span>
          <span className="truncate text-ink-2">{image.fileName}</span>
        </p>

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
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              id={moveButtonId(image.id, "up")}
              type="button"
              onClick={() => void move("up")}
              disabled={first}
              aria-label={t(locale, "orders.moveUp", { n: number })}
              className={ICON_BUTTON}
            >
              <ArrowUp aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
            <button
              id={moveButtonId(image.id, "down")}
              type="button"
              onClick={() => void move("down")}
              disabled={last}
              aria-label={t(locale, "orders.moveDown", { n: number })}
              className={ICON_BUTTON}
            >
              <ArrowDown aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
            {removable ? (
              <button ref={removeRef} type="button" onClick={() => setConfirming(true)} className={buttonClass("secondary")}>
                {t(locale, "orders.remove")}
              </button>
            ) : (
              <p className="text-[13px] text-ink-2">{t(locale, "orders.removeLocked")}</p>
            )}
          </div>
        )}

        {errorCode !== null && (
          <p className="text-sm text-red-fg" role="alert">
            {codeText(locale, "assignmentError", errorCode)}
          </p>
        )}
      </div>
    </li>
  );
}
