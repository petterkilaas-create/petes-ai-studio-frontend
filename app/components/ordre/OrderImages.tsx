"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { assignmentRequest } from "../../lib/api";
import {
  assignmentErrorCode,
  deleteAssignmentImage,
  getAssignment,
  MAX_IMAGES_PER_ASSIGNMENT,
  patchAssignmentImage,
  uploadAssignmentImage,
  type Assignment,
  type AssignmentImage,
} from "../../lib/assignments";
import { UploadQueue, type UploadRow } from "../../lib/uploadQueue";
import {
  applyMove,
  applyRemove,
  applyRoom,
  mergeUploaded,
  moveTarget,
  queueCapacity,
  uploadCounts,
} from "../../lib/ordrer";
import { ORDERS_PATH } from "../../lib/services";
import { ImageCard, moveButtonId, type ImageAction } from "./ImageCard";
import { UploadPanel } from "./UploadPanel";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Pill } from "../ui/Pill";
import { PageHeader } from "../ui/PageHeader";
import { FOCUS } from "../godkjenning/classes";
import { codeText, t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Bildene i ordren (TG-NEW-277, FE-2): henter ordren (K 2.3), laster opp med
 * koeen fra FE-0 (3 om gangen, Idempotency-Key per fil, «Last opp paa nytt»),
 * og viser rutenettet med rom, flytt opp/ned og «Fjern» (K 2.4-2.6). Reglene
 * ligger i lib/ordrer.ts. «Videre til tjenester» er av til brettet kommer (FE-3).
 */

type Load =
  | { kind: "loading" }
  | { kind: "ok"; assignment: Assignment }
  | { kind: "not_found" }
  | { kind: "error"; code: string };

export function OrderImages({ assignmentId }: { assignmentId: string }) {
  const { getToken } = useAuth();
  const locale = useLocale();

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [images, setImages] = useState<readonly AssignmentImage[]>([]);
  const [rows, setRows] = useState<readonly UploadRow[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const request = useMemo(() => assignmentRequest(getToken), [getToken]);
  // Koeen lages én gang; den bruker siste versjon av kallet (nytt token fra Clerk).
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  const [queue] = useState(
    () =>
      new UploadQueue({
        send: (file, key) =>
          uploadAssignmentImage(requestRef.current, { id: assignmentId, file, idempotencyKey: key }),
        // Ferdige bilder legges inn i rutenettet med en gang (ikke i en effekt).
        onChange: (next) => {
          setRows(next);
          setImages((prev) => mergeUploaded(prev, next));
        },
      })
  );

  const fetchAssignment = useCallback(async () => {
    try {
      const assignment = await getAssignment(requestRef.current, assignmentId);
      setLoad({ kind: "ok", assignment });
      setImages(mergeUploaded(assignment.images, queue.rows));
      queue.setCapacity(queueCapacity(assignment.images.length, queue.rows));
    } catch (err) {
      const code = assignmentErrorCode(err);
      setLoad((prev) =>
        // En stille henting som feiler, beholder siden som den er.
        prev.kind === "ok" ? prev : code === "not_found" ? { kind: "not_found" } : { kind: "error", code }
      );
    }
  }, [assignmentId, queue]);

  useEffect(() => {
    void fetchAssignment();
  }, [fetchAssignment]);

  // Ikke lukk fanen midt i opplastingen (filene som venter, er bare i nettleseren).
  const counts = uploadCounts(rows);
  const uploading = counts.active > 0;
  useEffect(() => {
    if (!uploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [uploading]);

  // Etter flytting: fokus tilbake paa samme knapp (eller den andre ytterst i lista).
  const focusAfterMove = useRef<{ id: string; dir: "up" | "down" } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitleAfterRemove = useRef(false);
  useEffect(() => {
    const f = focusAfterMove.current;
    if (f !== null) {
      focusAfterMove.current = null;
      const want = document.getElementById(moveButtonId(f.id, f.dir)) as HTMLButtonElement | null;
      const other = document.getElementById(moveButtonId(f.id, f.dir === "up" ? "down" : "up")) as HTMLButtonElement | null;
      (want !== null && !want.disabled ? want : other)?.focus();
    }
    if (focusTitleAfterRemove.current) {
      focusTitleAfterRemove.current = false;
      titleRef.current?.focus();
    }
  }, [images]);

  // Én flytting om gangen: plassene i neste kall regnes fra svaret paa forrige.
  const movingRef = useRef(false);

  async function changeRoom(image: AssignmentImage, room: string | null): ImageAction {
    try {
      await patchAssignmentImage(requestRef.current, { id: assignmentId, imageId: image.id, room });
      setImages((prev) => applyRoom(prev, image.id, room));
      setAnnouncement(t(locale, "orders.roomSaved"));
      return null;
    } catch (err) {
      return assignmentErrorCode(err);
    }
  }

  async function move(image: AssignmentImage, dir: "up" | "down"): ImageAction {
    const position = moveTarget(images, image.id, dir);
    if (position === null || movingRef.current) return null;
    movingRef.current = true;
    try {
      await patchAssignmentImage(requestRef.current, { id: assignmentId, imageId: image.id, position });
      focusAfterMove.current = { id: image.id, dir };
      setImages((prev) => applyMove(prev, image.id, position));
      setAnnouncement(t(locale, "orders.moved", { n: position }));
      return null;
    } catch (err) {
      return assignmentErrorCode(err);
    } finally {
      movingRef.current = false;
    }
  }

  async function remove(image: AssignmentImage): ImageAction {
    try {
      await deleteAssignmentImage(requestRef.current, { id: assignmentId, imageId: image.id });
    } catch (err) {
      const code = assignmentErrorCode(err);
      // Bildet har faatt resultater siden siden ble hentet: hent paa nytt, saa kortet viser det.
      if (code === "image_has_results") void fetchAssignment();
      return code;
    }
    // Ellers kommer bildet tilbake fra koeen (mergeUploaded).
    const row = queue.rows.find((r) => r.image?.id === image.id);
    if (row !== undefined) queue.remove(row.id);
    const next = applyRemove(images, image.id);
    queue.setCapacity(queueCapacity(next.length, queue.rows));
    focusTitleAfterRemove.current = true;
    setImages((prev) => applyRemove(prev, image.id));
    setAnnouncement(t(locale, "orders.removed"));
    return null;
  }

  if (load.kind === "loading") {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <div className="flex flex-col items-center justify-center py-24 gap-4" role="status">
          <div className="w-8 h-8 border-4 border-line border-t-ink rounded-full animate-spin motion-reduce:animate-none" />
          <p className="text-ink-2 text-sm">{t(locale, "orders.imagesLoading")}</p>
        </div>
      </main>
    );
  }

  if (load.kind !== "ok") {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <Card padding="lg" className="text-center max-w-lg mx-auto">
          {load.kind === "not_found" ? (
            <>
              <p className="text-ink font-medium text-lg mb-2">{t(locale, "orders.notFound")}</p>
              <p className="text-ink-2 text-sm mb-6">{t(locale, "orders.notFoundHint")}</p>
            </>
          ) : (
            <>
              <p className="text-red-fg font-medium mb-2">{t(locale, "orders.imagesLoadError")}</p>
              <p className="text-ink-2 text-sm mb-6">{codeText(locale, "assignmentError", load.code)}</p>
              <Button onClick={() => void fetchAssignment()}>{t(locale, "review.retry")}</Button>
            </>
          )}
          <p className="mt-6">
            <Link href={ORDERS_PATH} className={`text-sm text-ink underline ${FOCUS}`}>
              {t(locale, "orders.back")}
            </Link>
          </p>
        </Card>
      </main>
    );
  }

  const { assignment } = load;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <Link
        href={ORDERS_PATH}
        className={`mb-6 inline-flex min-h-11 items-center gap-2 rounded-button text-sm text-ink-2 hover:text-ink ${FOCUS}`}
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        {t(locale, "orders.back")}
      </Link>

      <div className="mb-8">
        <PageHeader
          title={<span className="break-words">{assignment.address}</span>}
          subtitle={assignment.assignmentNo ? t(locale, "orders.assignmentNo", { no: assignment.assignmentNo }) : undefined}
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-col gap-10">
        <UploadPanel
          rows={rows}
          onAdd={(files) => void queue.add(files)}
          onRetry={() => void queue.retryFailed()}
          onRemoveRow={(rowId) => void queue.remove(rowId)}
        />

        <section aria-labelledby="order-images-title" className="flex flex-col gap-4">
          <h2 id="order-images-title" ref={titleRef} tabIndex={-1} className={`text-lg font-medium text-ink rounded-button ${FOCUS}`}>
            {t(locale, "orders.imagesTitle", { n: images.length, max: MAX_IMAGES_PER_ASSIGNMENT })}
          </h2>
          {images.length === 0 ? (
            <p className="text-sm text-ink-2">{t(locale, "orders.imagesEmpty")}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {images.map((image, i) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  number={i + 1}
                  first={i === 0}
                  last={i === images.length - 1}
                  onRoom={(room) => changeRoom(image, room)}
                  onMove={(dir) => move(image, dir)}
                  onRemove={() => remove(image)}
                />
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <Button disabled aria-describedby="order-next-soon">
            {t(locale, "orders.next")}
          </Button>
          <span id="order-next-soon">
            <Pill tone="neutral">{t(locale, "orders.soon")}</Pill>
          </span>
        </div>
      </div>
    </main>
  );
}
