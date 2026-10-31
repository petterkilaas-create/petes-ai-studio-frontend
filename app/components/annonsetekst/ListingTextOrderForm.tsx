"use client";

import { useId } from "react";
import { ImageOff } from "lucide-react";
import type { AssignmentImage } from "../../lib/assignments";
import type { DocRow } from "../../lib/documentUpload";
import { countChars, NOTE_MAX_CHARS } from "../../lib/listingText";
import type { OrderBlock } from "../../lib/listingTextOrder";
import type { PropertyDraft, PropertyKey } from "../../lib/listingTextProperty";
import { DocumentUploadPanel } from "./DocumentUploadPanel";
import { ListingTextPropertyForm } from "./ListingTextPropertyForm";
import { FOCUS } from "../godkjenning/classes";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { t, type UiKey } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Bestillingen av tekstpakken (TG-NEW-281, T2 og K §10): bildene i ordren
 * som miniatyrer, Boligfakta, dokumentene, «Om boligen» og «Bestill
 * tekstpakke». Tilstanden (skjemaet, notatet, koeen, feilen) eies av
 * ListingTextOrder.
 */

const BLOCK_KEYS: Record<Exclude<OrderBlock, "sending">, UiKey> = {
  uploading: "listingText.order.blockUploading",
  no_material: "listingText.order.blockNoMaterial",
  note_too_long: "listingText.order.blockNoteTooLong",
  property_invalid: "listingText.order.blockPropertyInvalid",
};

export function ListingTextOrderForm({
  images,
  rows,
  property,
  orderAddress,
  onProperty,
  note,
  onNote,
  block,
  error,
  runError,
  onOrder,
  onAdd,
  onAbort,
  onRetry,
  onRemove,
}: {
  images: readonly AssignmentImage[];
  rows: readonly DocRow[];
  property: PropertyDraft;
  /** Adressen i ordren: fyller adressefeltet og telleren. */
  orderAddress: string;
  onProperty: (key: PropertyKey, value: string) => void;
  note: string;
  onNote: (note: string) => void;
  block: OrderBlock | null;
  /** Feilen fra bestillingen, ferdig tekst. */
  error: string | null;
  /** Kjoeringen som feilet uten versjon, ferdig tekst. */
  runError: string | null;
  onOrder: () => void;
  onAdd: (files: File[]) => void;
  onAbort: (rowId: string) => void;
  onRetry: (rowId: string) => void;
  onRemove: (rowId: string) => void;
}) {
  const locale = useLocale();
  const noteId = useId();
  const hintId = useId();
  const blockId = useId();
  const chars = countChars(note);

  return (
    <div className="flex flex-col gap-8">
      {runError !== null && (
        <div role="alert" className="rounded-card bg-red-bg p-4 text-sm text-red-fg">
          <p className="font-medium">{t(locale, "listingText.order.failedTitle")}</p>
          <p className="mt-1">{runError}</p>
        </div>
      )}

      <section aria-labelledby="listing-images-title" className="flex flex-col gap-3">
        <div>
          <h2 id="listing-images-title" className="text-lg font-medium text-ink">
            {t(locale, "listingText.order.imagesTitle")}
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {t(locale, images.length > 0 ? "listingText.order.imagesHint" : "listingText.order.noImages")}
          </p>
        </div>
        {images.length > 0 && (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {images.map((image) => (
              <li key={image.id} className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-button bg-surface-2">
                {image.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <ImageOff aria-hidden className="size-5 text-ink-2" strokeWidth={1.75} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ListingTextPropertyForm draft={property} orderAddress={orderAddress} onField={onProperty} />

      <DocumentUploadPanel rows={rows} onAdd={onAdd} onAbort={onAbort} onRetry={onRetry} onRemove={onRemove} />

      <section className="flex flex-col gap-2">
        <label htmlFor={noteId} className="text-lg font-medium text-ink">
          {t(locale, "listingText.order.noteLabel")}
        </label>
        <p id={hintId} className="text-sm text-ink-2">
          {t(locale, "listingText.order.noteHint")}
        </p>
        <textarea
          id={noteId}
          lang="nb"
          rows={6}
          maxLength={NOTE_MAX_CHARS}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          aria-describedby={hintId}
          className={`w-full bg-surface border border-ink-2 rounded-button p-3 text-sm text-ink ${FOCUS}`}
        />
        <p className={`self-end text-xs ${chars > NOTE_MAX_CHARS ? "text-red-fg" : "text-ink-2"}`}>
          {t(locale, "listingText.order.noteCount", { n: chars, max: NOTE_MAX_CHARS })}
        </p>
      </section>

      <Card padding="sm" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onOrder} disabled={block !== null} aria-describedby={block !== null && block !== "sending" ? blockId : undefined}>
            {t(locale, block === "sending" ? "listingText.order.sending" : "listingText.order.submit")}
          </Button>
          {block !== null && block !== "sending" && (
            <p id={blockId} className="text-sm text-ink-2">
              {t(locale, BLOCK_KEYS[block], { max: NOTE_MAX_CHARS })}
            </p>
          )}
        </div>
        {error !== null && (
          <p role="alert" className="text-sm text-red-fg">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
