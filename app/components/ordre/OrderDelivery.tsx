"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAssignment } from "../../hooks/useAssignment";
import { assignmentErrorCode, type Assignment } from "../../lib/assignments";
import { resultLabel } from "../../lib/brett";
import {
  deletedFileNames,
  deliveryCounts,
  deliveryExclude,
  deliveryGroups,
  deliverySummary,
  downloadZip,
  fileDetail,
  findResult,
  formatMegabytes,
  getDelivery,
  isIncluded,
  noteKey,
  noteLink,
  zipButtonText,
  type DeliveryFile,
  type DeliveryGroup,
  type DeliveryManifest,
} from "../../lib/delivery";
import { saveBlob } from "../../lib/download";
import { browserStorage } from "../../lib/board";
import { draftCount } from "../../lib/orderProgress";
import { ORDERS_PATH } from "../../lib/services";
import { DownloadButton } from "../godkjenning/DownloadButton";
import { LoadState } from "./LoadState";
import { OrderProgress } from "./OrderProgress";
import { Button } from "../ui/Button";
import { Card, cardClass } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { FOCUS } from "../godkjenning/classes";
import { codeText, t, type Locale } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

type ManifestLoad = { kind: "loading" } | { kind: "ok"; manifest: DeliveryManifest } | { kind: "error"; code: string };

type ZipState =
  | { kind: "idle" }
  | { kind: "running"; bytes: number }
  | { kind: "done"; bytes: number }
  | { kind: "error"; code: string; files: string[] };

/** Fremdriften vises i steg paa 0,1 MB (ellers en ny render per bit fra nettet). */
const PROGRESS_STEP = 100_000;

/**
 * Nedlastingen (TG-NEW-277, FE-5; skissen «Nedlasting»): den eksakte fillista
 * fra manifestet (K 2.8) per bilde, med av/paa for resultatene, merknadene
 * for det som ikke er med, og «Last ned ZIP» (K 2.9) med `exclude`. ZIP-en
 * hentes som blob med token og lagres med saveBlob; knappen er laast mens den
 * laster, og fremdriften er antall MB mottatt. Et godkjent, merket resultat
 * kan ogsaa lastes ned alene (DownloadButton, /v1/jobs/{id}/download).
 * Ingen beskjaering ved lansering.
 *
 * Fremdriftslinja (Dag 59) er steg 5: «Last ned ZIP (N filer)» staar i
 * linja med samme handling og laas (valg 3A: dagens tekst). Fremdriften i MB
 * og svaret blir staaende nederst paa siden, ikke lenger sticky. Lenken
 * oeverst gaar til ordrene (valg 2A).
 */
export function OrderDelivery({ assignmentId }: { assignmentId: string }) {
  const locale = useLocale();
  const { load, reload, request } = useAssignment(assignmentId);
  const [manifestLoad, setManifestLoad] = useState<ManifestLoad>({ kind: "loading" });
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const [zip, setZip] = useState<ZipState>({ kind: "idle" });
  // Synkront vern mot dobbeltklikk, og avbrudd naar siden forlates.
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  const fetchManifest = useCallback(async () => {
    try {
      const manifest = await getDelivery(requestRef.current, assignmentId);
      setManifestLoad({ kind: "ok", manifest });
    } catch (err) {
      setManifestLoad({ kind: "error", code: assignmentErrorCode(err) });
    }
  }, [assignmentId]);

  useEffect(() => {
    void fetchManifest();
  }, [fetchManifest]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const retry = () => {
    setManifestLoad({ kind: "loading" });
    void reload();
    void fetchManifest();
  };

  if (load.kind !== "ok") return <LoadState load={load} onRetry={retry} />;
  if (manifestLoad.kind === "loading") {
    return <LoadState load={{ kind: "loading" }} onRetry={retry} />;
  }

  const { assignment } = load;

  if (manifestLoad.kind === "error") {
    return (
      <Shell assignment={assignment} primary={null}>
        <Card padding="lg" className="text-center max-w-lg mx-auto">
          <p className="text-red-fg font-medium mb-2">{t(locale, "delivery.loadError")}</p>
          <p className="text-ink-2 text-sm mb-6">{codeText(locale, "assignmentError", manifestLoad.code)}</p>
          <Button onClick={retry}>{t(locale, "review.retry")}</Button>
        </Card>
      </Shell>
    );
  }

  const { manifest } = manifestLoad;
  const counts = deliveryCounts(manifest.files, off);
  const groups = deliveryGroups(manifest, assignment.images);
  const running = zip.kind === "running";

  const toggle = (key: string) => {
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const excludeDeleted = (keys: readonly string[]) => {
    const removable = manifest.files.filter((f) => f.toggleable && keys.includes(f.key)).map((f) => f.key);
    setOff((prev) => new Set([...prev, ...removable]));
    setZip({ kind: "idle" });
  };

  async function onZip() {
    if (inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setZip({ kind: "running", bytes: 0 });
    let shown = 0;
    const result = await downloadZip({
      request: requestRef.current,
      id: assignmentId,
      exclude: deliveryExclude(manifest.files, off),
      zipName: manifest.zipName,
      address: assignment.address,
      save: saveBlob,
      signal: controller.signal,
      onProgress: (bytes) => {
        if (bytes - shown < PROGRESS_STEP) return;
        shown = bytes;
        setZip({ kind: "running", bytes });
      },
    });
    inFlight.current = false;
    abortRef.current = null;
    if (result.kind === "cancelled") return;
    setZip(
      result.kind === "ok" ? { kind: "done", bytes: result.bytes } : { kind: "error", code: result.code, files: result.files }
    );
  }

  return (
    <Shell
      assignment={assignment}
      primary={
        manifest.files.length === 0 ? null : (
          <Button onClick={() => void onZip()} disabled={running || counts.total === 0}>
            {running ? t(locale, "review.downloading") : zipButtonText(locale, counts.total)}
          </Button>
        )
      }
    >
      {manifest.files.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-ink">{t(locale, "delivery.empty")}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink">{deliverySummary(locale, counts)}</p>
            <p className="text-[13px] text-ink-2">{t(locale, "delivery.about")}</p>
          </div>

          <ul className="flex flex-col gap-3" aria-label={t(locale, "delivery.listLabel")}>
            {groups.map((group) => (
              <ImageGroup
                key={group.imageId}
                assignmentId={assignmentId}
                group={group}
                off={off}
                locked={running}
                onToggle={toggle}
              />
            ))}
          </ul>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <p className="text-[13px] text-ink-2 md:hidden">{t(locale, "delivery.mobile")}</p>
            {running && (
              <p className="text-sm text-ink-2">
                {zip.bytes === 0
                  ? t(locale, "delivery.preparing")
                  : t(locale, "delivery.receiving", { mb: formatMegabytes(locale, zip.bytes) })}
              </p>
            )}
            <ZipStatus
              zip={zip}
              locale={locale}
              names={zip.kind === "error" ? deletedFileNames(manifest.files, zip.files) : []}
              onExcludeDeleted={() => zip.kind === "error" && excludeDeleted(zip.files)}
            />
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Lenken til ordrene, tittelen og fremdriftslinja, felles for fillista og feilen. */
function Shell({
  assignment,
  primary,
  children,
}: {
  assignment: Assignment;
  primary: React.ReactNode;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <Link
        href={ORDERS_PATH}
        className={`mb-6 inline-flex min-h-11 items-center gap-2 rounded-button text-sm text-ink-2 hover:text-ink ${FOCUS}`}
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        {t(locale, "orders.back")}
      </Link>
      <div className="mb-8">
        <PageHeader title={t(locale, "delivery.title")} subtitle={<span className="break-words">{assignment.address}</span>} />
      </div>
      {children}
      <OrderProgress
        page="delivery"
        assignment={assignment}
        draftCount={draftCount(browserStorage(), assignment.id, assignment.images.map((img) => img.id))}
        primary={primary}
      />
    </main>
  );
}

/** Ett bilde: originalen, resultatene med av/paa og merknadene for det som ikke er med. */
function ImageGroup({
  assignmentId,
  group,
  off,
  locked,
  onToggle,
}: {
  assignmentId: string;
  group: DeliveryGroup;
  off: ReadonlySet<string>;
  locked: boolean;
  onToggle: (key: string) => void;
}) {
  const locale = useLocale();
  const { image } = group;
  const name = image !== null ? (image.room ?? image.fileName) : (group.files[0]?.name ?? "");
  const titleId = `delivery-image-${group.imageId}`;
  const labelOf = (resultId: string | null) => {
    const r = findResult(image, resultId);
    return r === null ? null : resultLabel(locale, r);
  };
  return (
    <li className={cardClass("none", "flex flex-col gap-3 p-3")} aria-labelledby={titleId}>
      <div className="flex items-center gap-3">
        <span className="flex aspect-[4/3] w-16 shrink-0 items-center justify-center overflow-hidden rounded-button bg-surface-2">
          {image?.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
        </span>
        <h2 id={titleId} className="min-w-0 break-words text-sm font-medium text-ink">
          {t(locale, "delivery.imageTitle", { n: group.number, room: name })}
        </h2>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {group.files.map((file) => (
          <FileRow
            key={file.key}
            file={file}
            label={labelOf(file.resultId)}
            included={isIncluded(file, off)}
            locked={locked}
            onToggle={() => onToggle(file.key)}
          />
        ))}
      </ul>
      {group.notes.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-line pt-3">
          {group.notes.map((note) => {
            const link = noteLink(assignmentId, note);
            const label = labelOf(note.resultId) ?? t(locale, "board.service.unknown");
            return (
              <li key={`${note.code}|${note.resultId ?? ""}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="min-w-0 flex-1 text-ink-2">{t(locale, noteKey(note.code), { label })}</span>
                <Link href={link.href} className={`inline-flex min-h-11 items-center text-ink underline ${FOCUS}`}>
                  {t(locale, link.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** En fil: navnet, hva den er, av/paa (resultatene) og «Last ned fil» for et merket resultat som er med. */
function FileRow({
  file,
  label,
  included,
  locked,
  onToggle,
}: {
  file: DeliveryFile;
  label: string | null;
  included: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  const locale = useLocale();
  const isResult = file.kind === "result";
  return (
    <li className={`flex flex-col gap-2 py-2 sm:flex-row sm:items-center ${isResult ? "sm:pl-6" : ""}`}>
      <div className={`min-w-0 flex-1 ${included ? "" : "opacity-50"}`}>
        <p className="break-all text-sm text-ink">{file.name}</p>
        <p className="text-[13px] text-ink-2">
          {fileDetail(locale, file, label)}
          {!included && ` · ${t(locale, "delivery.left")}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {file.toggleable ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-button px-2 text-sm text-ink">
            <input
              type="checkbox"
              role="switch"
              checked={included}
              disabled={locked}
              onChange={onToggle}
              aria-label={t(locale, "delivery.includeLabel", { file: file.name })}
              className="size-5 accent-ink"
            />
            {t(locale, "delivery.include")}
          </label>
        ) : (
          <span className="px-2 text-[13px] text-ink-2">{t(locale, "delivery.always")}</span>
        )}
        {isResult && file.marked && file.resultId !== null && included && (
          <DownloadButton
            jobId={file.resultId}
            presetId={null}
            locale={locale}
            fileName={file.name}
            ariaLabel={t(locale, "delivery.singleLabel", { file: file.name })}
          />
        )}
      </div>
    </li>
  );
}

/** Svaret paa ZIP-en for skjermlesere og synlig: ferdig, eller feilen fra ordlista (med de slettede filene). */
function ZipStatus({
  zip,
  locale,
  names,
  onExcludeDeleted,
}: {
  zip: ZipState;
  locale: Locale;
  names: string[];
  onExcludeDeleted: () => void;
}) {
  return (
    <div role="status" aria-live="polite" className="text-sm">
      {zip.kind === "done" && <p className="text-green-fg">{t(locale, "delivery.done", { mb: formatMegabytes(locale, zip.bytes) })}</p>}
      {zip.kind === "error" && (
        <div className="flex flex-col gap-2 text-red-fg">
          <p>{codeText(locale, "deliveryError", zip.code)}</p>
          {names.length > 0 && (
            <>
              <p className="text-[13px] text-ink-2">{t(locale, "delivery.deletedFiles")}</p>
              <ul className="text-[13px] text-ink-2">
                {names.map((n) => (
                  <li key={n} className="break-all">
                    {n}
                  </li>
                ))}
              </ul>
              <div>
                <Button variant="secondary" onClick={onExcludeDeleted}>
                  {t(locale, "delivery.excludeDeleted")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
