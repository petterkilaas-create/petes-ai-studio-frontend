"use client";

import { useRef, useState, type DragEvent } from "react";
import { Check, FilePlus, LoaderCircle } from "lucide-react";
import { DOCUMENT_ACCEPT, type DocRow } from "../../lib/documentUpload";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS } from "../../lib/listingText";
import { Button } from "../ui/Button";
import { cardClass } from "../ui/Card";
import { codeText, t, type Locale } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Dokumentene til tekstpakken (TG-NEW-281, T2): slippfeltet og lista med
 * status per fil, som opplastingen av bilder (UploadPanel, FE-2). Koeen
 * (DocumentQueue) eies av forelderen. Lista er en levende region der hver
 * rad leses i sin helhet naar statusen endres; prosenten er skjult for
 * skjermleseren, saa den ikke leses opp for hvert steg.
 */

const ACTIVE = new Set<DocRow["state"]>(["queued", "starting", "uploading", "checking"]);

function statusText(locale: Locale, row: DocRow): string {
  switch (row.state) {
    case "queued":
      return t(locale, "listingText.docs.queued");
    case "starting":
    case "uploading":
      return t(locale, "listingText.docs.uploading", { n: row.progress });
    case "checking":
      return t(locale, "listingText.docs.checking");
    case "ready":
      return t(locale, "listingText.docs.ready");
    case "rejected":
      return t(locale, "listingText.docs.rejected", { reason: codeText(locale, "listingTextDocumentReject", row.rejectCode) });
    case "failed":
      return t(locale, "listingText.docs.failed");
    case "aborted":
      return t(locale, "listingText.docs.aborted");
  }
}

export function DocumentUploadPanel({
  rows,
  onAdd,
  onAbort,
  onRetry,
  onRemove,
}: {
  rows: readonly DocRow[];
  onAdd: (files: File[]) => void;
  onAbort: (rowId: string) => void;
  onRetry: (rowId: string) => void;
  onRemove: (rowId: string) => void;
}) {
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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

  const hasReady = rows.some((r) => r.state === "ready");

  return (
    <section aria-labelledby="listing-docs-title" className="flex flex-col gap-4">
      <div>
        <h2 id="listing-docs-title" className="text-lg font-medium text-ink">
          {t(locale, "listingText.docs.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          {t(locale, "listingText.docs.hint", { max: MAX_DOCUMENTS, mb: MAX_DOCUMENT_BYTES / (1024 * 1024) })}
        </p>
      </div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-ink bg-surface-2" : "border-line-strong bg-surface"
        }`}
      >
        <FilePlus aria-hidden className="size-8 text-ink-2" strokeWidth={1.5} />
        <p className="text-base font-medium text-ink">
          {t(locale, dragging ? "listingText.docs.dropActive" : "listingText.docs.dropTitle")}
        </p>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          {t(locale, "listingText.docs.choose")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={DOCUMENT_ACCEPT}
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
      {!hasReady && <p className="text-sm text-ink-2">{t(locale, "listingText.docs.noDocsHint")}</p>}

      {rows.length > 0 && (
        <ul aria-live="polite" aria-relevant="text" className={cardClass("sm", "flex flex-col divide-y divide-line")}>
          {rows.map((row) => {
            const uploading = row.state === "uploading" || row.state === "starting";
            const status = statusText(locale, row);
            const bad = row.state === "failed" || row.state === "rejected";
            return (
              <li key={row.id} aria-atomic="true" className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
                <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
                  {ACTIVE.has(row.state) ? (
                    <LoaderCircle className="size-4 animate-spin text-ink-2 motion-reduce:animate-none" strokeWidth={1.75} />
                  ) : row.state === "ready" ? (
                    <Check className="size-4 text-green-fg" strokeWidth={2} />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 break-words text-ink">{row.fileName}</span>
                {uploading ? (
                  <span className="text-ink-2">
                    <span aria-hidden>{status}</span>
                    <span className="sr-only">{t(locale, "listingText.docs.uploadingSr")}</span>
                  </span>
                ) : (
                  <span className={bad ? "text-red-fg" : "text-ink-2"}>{status}</span>
                )}
                {uploading && (
                  <div
                    role="progressbar"
                    aria-label={t(locale, "listingText.docs.progressLabel", { file: row.fileName })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={row.progress}
                    className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2"
                  >
                    <div className="h-full bg-ink transition-[width]" style={{ width: `${row.progress}%` }} />
                  </div>
                )}
                {row.failure !== null && (
                  <span className="w-full pl-8 text-red-fg">{codeText(locale, "listingTextError", row.failure)}</span>
                )}
                <span className="flex w-full flex-wrap gap-2 pl-8 empty:hidden">
                  {(row.state === "queued" || row.state === "uploading") && (
                    <Button variant="secondary" onClick={() => onAbort(row.id)}>
                      {t(locale, "listingText.docs.abort")}
                    </Button>
                  )}
                  {row.canRetry && !ACTIVE.has(row.state) && (
                    <Button variant="secondary" onClick={() => onRetry(row.id)}>
                      {t(locale, "listingText.docs.retry")}
                    </Button>
                  )}
                  {!ACTIVE.has(row.state) && (
                    <Button variant="secondary" onClick={() => onRemove(row.id)}>
                      {t(locale, "listingText.docs.remove")}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
