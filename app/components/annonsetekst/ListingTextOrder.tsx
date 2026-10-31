"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { AssignmentRequest } from "../../lib/assignments";
import { useAssignment } from "../../hooks/useAssignment";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useListingText } from "../../hooks/useListingText";
import { browserXhr, DocumentQueue, type DocRow, type XhrFactory } from "../../lib/documentUpload";
import {
  ListingTextError,
  orderCallSignature,
  orderListingText,
  type ListingText,
  type ListingTextOrder as OrderBody,
} from "../../lib/listingText";
import {
  failedRunCode,
  LISTING_TEXT_POLL_MAX_MS,
  LISTING_TEXT_POLL_MS,
  listingTextView,
  orderBlock,
  orderErrorText,
  refetchAfter,
} from "../../lib/listingTextOrder";
import { browserOpenTab, type PdfTab } from "../../lib/listingTextPackage";
import { CallKeys } from "../../lib/orderStart";
import { LISTING_TEXT_PATH } from "../../lib/services";
import { LoadState } from "../ordre/LoadState";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FOCUS } from "../godkjenning/classes";
import { ListingTextOrderForm } from "./ListingTextOrderForm";
import { ListingTextPackage } from "./ListingTextPackage";
import { ListingTextSteps } from "./ListingTextSteps";
import { codeText, t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

const BACK = { href: LISTING_TEXT_PATH, key: "listingText.page.back" } as const;
const NO_CHANNELS = { finn: null, social: null, email: null } as const;

/** Kallene utenfra: bare mock-modusen i `next dev` (ListingTextMock). */
export interface ListingTextDeps {
  request: AssignmentRequest;
  xhr: XhrFactory;
  /** «Åpne PDF»: mock aapner ingen fane. */
  openTab: () => PdfTab | null;
}

/**
 * Tekstsiden for en ordre (TG-NEW-281, T2). Ordren hentes med GET
 * /v1/assignments/{id} og pakken med GET …/listing-text (uten grunnlaget).
 * `display_status` velger delen (listingTextView): bestillingen med bildene,
 * dokumentene og notatet; «Behandles» med trinnlista, hentet hvert 4. sekund
 * til statusen ikke lenger er `processing`; eller tekstpakken
 * (ListingTextPackage, T3).
 *
 * «Bestill tekstpakke» faar en ny Idempotency-Key per bestilling og samme
 * noekkel bare ved nytt forsoek med samme kropp etter nettfeil (CallKeys, som
 * FE-3).
 */
export function ListingTextOrder({ assignmentId, deps }: { assignmentId: string; deps?: ListingTextDeps }) {
  const locale = useLocale();
  const { load, reload, request } = useAssignment(assignmentId, undefined, deps?.request);
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  const [rows, setRows] = useState<readonly DocRow[]>([]);
  // Kallet fra foerste visning: assignmentRequest henter tokenet ved hvert kall.
  const [queue] = useState(
    () =>
      new DocumentQueue({
        request,
        assignmentId,
        xhr: deps?.xhr ?? browserXhr,
        onChange: (next) => setRows(next),
      })
  );
  const [keys] = useState(() => new CallKeys());
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [orderError, setOrderError] = useState<{ err: unknown; at: Date } | null>(null);

  // Dokumentene i pakken fra foer (ogsaa etter en ny henting) legges i koeen.
  const onPackage = useCallback((pkg: ListingText) => queue.seed(pkg.documents), [queue]);
  const text = useListingText(assignmentId, request, onPackage);
  const pkg = text.load.kind === "ok" ? text.load.pkg : null;
  const view = pkg === null ? null : listingTextView(pkg);

  useAutoRefresh(view === "processing", text.reload, 0, LISTING_TEXT_POLL_MAX_MS, LISTING_TEXT_POLL_MS);

  if (load.kind !== "ok") return <LoadState load={load} onRetry={() => void reload()} back={BACK} />;
  const { assignment } = load;

  async function order() {
    const body: OrderBody = { note, documentIds: queue.readyIds.length > 0 ? queue.readyIds : undefined };
    const key = keys.keyFor(orderCallSignature("order", assignmentId, body));
    setSending(true);
    setOrderError(null);
    try {
      const next = await orderListingText(requestRef.current, { id: assignmentId, order: body, idempotencyKey: key });
      keys.received();
      text.setPackage(next);
    } catch (err) {
      // Et svar fra backend glemmer noekkelen; en nettfeil beholder den til samme kall sendes igjen.
      if (err instanceof ListingTextError) keys.received();
      setOrderError({ err, at: new Date() });
      if (refetchAfter(err)) void text.reload();
    } finally {
      setSending(false);
    }
  }

  const block = orderBlock({
    images: assignment.images.length,
    readyDocuments: rows.filter((r) => r.state === "ready").length,
    note,
    uploading: rows.some((r) => r.state === "queued" || r.state === "starting" || r.state === "uploading" || r.state === "checking"),
    sending,
  });
  const runCode = pkg === null ? null : failedRunCode(pkg);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <Link
        href={LISTING_TEXT_PATH}
        className={`mb-6 inline-flex min-h-11 items-center gap-2 rounded-button text-sm text-ink-2 hover:text-ink ${FOCUS}`}
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        {t(locale, BACK.key)}
      </Link>
      <div className="mb-8">
        <PageHeader
          title={t(locale, "listingText.page.title")}
          subtitle={<span className="break-words">{assignment.address}</span>}
        />
      </div>

      {text.load.kind === "loading" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-ink motion-reduce:animate-none" />
          <p className="text-sm text-ink-2">{t(locale, "listingText.page.loading")}</p>
        </div>
      )}

      {text.load.kind === "error" && (
        <Card padding="lg" className="mx-auto max-w-lg text-center">
          <p className="mb-2 font-medium text-red-fg">{t(locale, "listingText.load.error")}</p>
          <p className="mb-6 text-sm text-ink-2">{codeText(locale, "listingTextError", text.load.code)}</p>
          <Button onClick={() => void text.reload()}>{t(locale, "review.retry")}</Button>
        </Card>
      )}

      {pkg !== null && view === "order" && (
        <ListingTextOrderForm
          images={assignment.images}
          rows={rows}
          note={note}
          onNote={setNote}
          block={block}
          error={orderError === null ? null : orderErrorText(locale, orderError.err, orderError.at)}
          runError={runCode === null ? null : codeText(locale, "listingTextRunError", runCode)}
          onOrder={() => void order()}
          onAdd={(files) => queue.add(files)}
          onAbort={(id) => queue.abort(id)}
          onRetry={(id) => queue.retry(id)}
          onRemove={(id) => void queue.remove(id)}
        />
      )}

      {pkg !== null && view === "processing" && <ListingTextSteps step={pkg.lastRun?.step ?? null} />}

      {pkg !== null && view === "ready" && (
        <ListingTextPackage
          pkg={pkg}
          channels={pkg.channels ?? NO_CHANNELS}
          assignmentId={assignmentId}
          request={request}
          openTab={deps?.openTab ?? browserOpenTab}
        />
      )}

      {pkg !== null && view === "deleted" && (
        <Card>
          <p className="text-sm text-ink-2">{codeText(locale, "listingTextError", "media_deleted")}</p>
        </Card>
      )}

      {pkg !== null && view === "unknown" && (
        <Card>
          <p className="text-sm text-ink-2">{t(locale, "status.unknown")}</p>
        </Card>
      )}
    </main>
  );
}
