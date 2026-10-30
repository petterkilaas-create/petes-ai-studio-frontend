"use client";

import { useRef, useState, type DragEvent } from "react";
import { Check, ImagePlus, LoaderCircle } from "lucide-react";
import { MAX_IMAGES_PER_ASSIGNMENT } from "../../lib/assignments";
import { UPLOAD_ACCEPT, type UploadRow } from "../../lib/uploadQueue";
import { uploadCounts, uploadSummary } from "../../lib/ordrer";
import { Button } from "../ui/Button";
import { cardClass } from "../ui/Card";
import { t, uploadErrorText, type UiKey } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Opplastingen (FE-2, audit punkt 2): «Velg filer» og dra og slipp, og lista
 * med status per fil. Lista er en levende region (polite) der hver rad leses
 * i sin helhet (filnavn og status) naar statusen endres, saa skjermleseren
 * faar status per fil uten at nye rader leses opp. Koeen eies av forelderen.
 */

const STATE_KEYS: Record<UploadRow["state"], UiKey> = {
  queued: "upload.queued",
  uploading: "upload.uploading",
  done: "upload.done",
  failed: "upload.failed",
};

export function UploadPanel({
  rows,
  onAdd,
  onRetry,
  onRemoveRow,
}: {
  rows: readonly UploadRow[];
  onAdd: (files: File[]) => void;
  onRetry: () => void;
  onRemoveRow: (rowId: string) => void;
}) {
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const counts = uploadCounts(rows);
  const summary = uploadSummary(locale, counts);

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    // Bare naar pekeren forlater sonen, ikke naar den gaar over et barn.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onAdd(files);
  }

  return (
    <section aria-labelledby="order-upload-title" className="flex flex-col gap-4">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-ink bg-surface-2" : "border-line-strong bg-surface"
        }`}
      >
        <ImagePlus aria-hidden className="size-8 text-ink-2" strokeWidth={1.5} />
        <h2 id="order-upload-title" className="text-lg font-medium text-ink">
          {t(locale, dragging ? "orders.dropActive" : "orders.dropTitle")}
        </h2>
        <p className="text-sm text-ink-2">{t(locale, "upload.hint")}</p>
        <Button onClick={() => inputRef.current?.click()}>{t(locale, "orders.chooseFiles")}</Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            // Tom verdi, saa samme fil kan velges paa nytt.
            e.target.value = "";
            if (files.length > 0) onAdd(files);
          }}
        />
      </div>

      {rows.length > 0 && (
        <div className={cardClass("sm", "flex flex-col gap-3")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-ink">{t(locale, "orders.uploadsTitle")}</h3>
            <p className="text-sm text-ink-2">{summary}</p>
          </div>

          {counts.limit && (
            <p className="rounded-button bg-amber-bg p-3 text-sm text-amber-fg">
              {t(locale, "upload.limit", { max: MAX_IMAGES_PER_ASSIGNMENT })}
            </p>
          )}

          {counts.retryable > 0 && (
            <div>
              <Button variant="secondary" onClick={onRetry}>
                {t(locale, "upload.retry")}
              </Button>
            </div>
          )}

          <ul aria-live="polite" aria-relevant="text" className="flex flex-col divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} aria-atomic="true" className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
                  {row.state === "uploading" ? (
                    <LoaderCircle className="size-4 animate-spin text-ink-2 motion-reduce:animate-none" strokeWidth={1.75} />
                  ) : row.state === "done" ? (
                    <Check className="size-4 text-green-fg" strokeWidth={2} />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{row.file.name}</span>
                <span className={row.state === "failed" ? "text-red-fg" : "text-ink-2"}>
                  {t(locale, STATE_KEYS[row.state])}
                </span>
                {row.state === "failed" && row.failure !== null && (
                  <span className="w-full pl-8 text-red-fg">
                    {uploadErrorText(locale, row.failure.code, row.failure.reason)}
                  </span>
                )}
                {row.state === "failed" && (
                  <span className="w-full pl-8">
                    <Button variant="secondary" onClick={() => onRemoveRow(row.id)}>
                      {t(locale, "orders.removeRow")}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
