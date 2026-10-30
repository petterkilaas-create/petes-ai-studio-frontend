"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ArrowLeft, X } from "lucide-react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
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
  dragTarget,
  isProcessing,
  keepImageUrls,
  menuTarget,
  mergeUploaded,
  orderDeliveryHref,
  orderImagesHref,
  orderServicesHref,
  positionOf,
  queueCapacity,
  resultSummary,
  showStartedBanner,
  uploadCounts,
  URL_REFRESH_MS,
  type MoveAction,
} from "../../lib/ordrer";
import { deliveryFileCount, deliveryLinkText } from "../../lib/delivery";
import { ORDER_REFRESH_MAX_MS, type RefreshResult } from "../../lib/autoRefresh";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { ORDERS_PATH } from "../../lib/services";
import { ImageCard, menuButtonId, type ImageAction } from "./ImageCard";
import { UploadPanel } from "./UploadPanel";
import { Button, ButtonLink } from "../ui/Button";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { FOCUS } from "../godkjenning/classes";
import { codeText, t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Bildene i ordren (TG-NEW-277, FE-2): henter ordren (K 2.3), laster opp med
 * koeen fra FE-0 (3 om gangen, Idempotency-Key per fil, «Last opp paa nytt»),
 * og viser rutenettet med rom, flytt opp/ned og «Fjern» (K 2.4-2.6). Reglene
 * ligger i lib/ordrer.ts.
 *
 * FE-3: resultatene vises under hvert bilde. Mens noe behandles, hentes hele
 * ordren paa nytt hvert 5. sekund (én henting, som Historikk), med tak paa 30
 * minutter. «Videre til tjenester» og «Bestill flere tjenester» gaar til brettet.
 * `started` er antall som ble startet (fra oppsummeringen, `?startet=`).
 *
 * Banneret om startet (FE-3c): tallet holdes i tilstanden, og `startet` tas
 * ut av adressen med router.replace etter foerste visning, saa det ikke kommer
 * tilbake ved ny lasting. Det skjules naar ingenting lenger behandles, og kan
 * lukkes med ×. Kortene staar to i bredden fra 1024 px (ett under), og
 * resultatene staar i hele kortets bredde (ImageCard).
 *
 * Rekkefoelgen endres med dra og slipp (dnd-kit, FE-3 tillegg) eller menyen
 * «⋯» paa kortet. Bildet flyttes med en gang, og PATCH sendes; feiler den,
 * settes bildet tilbake og feilen vises over rutenettet.
 */

/** Musa drar hele kortet, men ikke fra feltet, knappene eller menyen (de har egne klikk). */
class CardMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: ({ nativeEvent }: { nativeEvent: MouseEvent }) => {
        const target = nativeEvent.target as Element | null;
        if (nativeEvent.button !== 0 || target === null) return false;
        return target.closest("input, textarea, select, a, [role=menu], button:not([data-drag-handle])") === null;
      },
    },
  ];
}

type Load =
  | { kind: "loading" }
  | { kind: "ok"; assignment: Assignment }
  | { kind: "not_found" }
  | { kind: "error"; code: string };

export function OrderImages({ assignmentId, started = null }: { assignmentId: string; started?: number | null }) {
  const { getToken } = useAuth();
  const locale = useLocale();
  const router = useRouter();

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [images, setImages] = useState<readonly AssignmentImage[]>([]);
  const [rows, setRows] = useState<readonly UploadRow[]>([]);
  const [announcement, setAnnouncement] = useState("");
  // «Oppdater» starter telleren for den automatiske hentingen paa nytt.
  const [refreshKey, setRefreshKey] = useState(0);
  // Naar lenkene fra backend ble hentet sist (de beholdes til de er 45 minutter gamle).
  const urlsAt = useRef(0);
  // Én flytting om gangen; mens et bilde dras eller flyttes, endrer ikke hentingen rekkefoelgen.
  const movingRef = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // Banneret: tallet fra `?startet=` ved foerste visning (adressen ryddes under), og om det er lukket.
  const [startedCount] = useState(started);
  const [bannerClosed, setBannerClosed] = useState(false);

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

  const fetchAssignment = useCallback(async (): Promise<RefreshResult> => {
    try {
      const assignment = await getAssignment(requestRef.current, assignmentId);
      const now = Date.now();
      const keep = now - urlsAt.current < URL_REFRESH_MS;
      if (!keep) urlsAt.current = now;
      setLoad({ kind: "ok", assignment });
      if (!movingRef.current) setImages((prev) => mergeUploaded(keepImageUrls(prev, assignment.images, keep), queue.rows));
      queue.setCapacity(queueCapacity(assignment.images.length, queue.rows));
      return { ok: true, working: isProcessing(assignment) };
    } catch (err) {
      const code = assignmentErrorCode(err);
      setLoad((prev) =>
        // En stille henting som feiler, beholder siden som den er.
        prev.kind === "ok" ? prev : code === "not_found" ? { kind: "not_found" } : { kind: "error", code }
      );
      return { ok: false, working: true };
    }
  }, [assignmentId, queue]);

  // Mens noe behandles: hele ordren hvert 5. sekund, tak paa 30 minutter (audit punkt 3).
  const processing = load.kind === "ok" && isProcessing(load.assignment);
  useAutoRefresh(processing, fetchAssignment, refreshKey, ORDER_REFRESH_MAX_MS);

  useEffect(() => {
    void fetchAssignment();
  }, [fetchAssignment]);

  // `startet` ut av adressen, saa banneret ikke kommer tilbake ved ny lasting (tallet staar i tilstanden).
  useEffect(() => {
    if (started !== null) router.replace(orderImagesHref(assignmentId), { scroll: false });
  }, [started, assignmentId, router]);

  // Ikke lukk fanen midt i opplastingen (filene som venter, er bare i nettleseren).
  const counts = uploadCounts(rows);
  const uploading = counts.active > 0;
  useEffect(() => {
    if (!uploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [uploading]);

  // Etter flytting med menyen: fokus tilbake paa menyknappen til bildet.
  const focusAfterMove = useRef<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitleAfterRemove = useRef(false);
  useEffect(() => {
    const f = focusAfterMove.current;
    if (f !== null) {
      focusAfterMove.current = null;
      document.getElementById(menuButtonId(f))?.focus();
    }
    if (focusTitleAfterRemove.current) {
      focusTitleAfterRemove.current = false;
      titleRef.current?.focus();
    }
  }, [images]);

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

  /**
   * Flytt bildet til `position` med en gang, og send PATCH. Feiler den, settes
   * bildet tilbake paa plassen det kom fra. `announce`: kunngjoeringen kommer
   * herfra (menyen); ved dra og slipp kommer den fra dnd-kit.
   */
  async function moveTo(image: AssignmentImage, position: number, opts: { announce: boolean; focusMenu: boolean }) {
    const from = positionOf(images, image.id);
    if (from === null || from === position || movingRef.current) return;
    movingRef.current = true;
    setMoveError(null);
    if (opts.focusMenu) focusAfterMove.current = image.id;
    setImages((prev) => applyMove(prev, image.id, position));
    try {
      await patchAssignmentImage(requestRef.current, { id: assignmentId, imageId: image.id, position });
      if (opts.announce) setAnnouncement(t(locale, "orders.moved", { from, n: position }));
    } catch (err) {
      setImages((prev) => applyMove(prev, image.id, from));
      setMoveError(assignmentErrorCode(err));
    } finally {
      movingRef.current = false;
    }
  }

  function moveByMenu(image: AssignmentImage, action: MoveAction) {
    const position = menuTarget(images, image.id, action);
    if (position !== null) void moveTo(image, position, { announce: true, focusMenu: true });
  }

  // Dra og slipp: mus paa hele kortet, finger og tastatur paa haandtaket (ImageCard).
  const sensors = useSensors(
    useSensor(CardMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const numberOf = (id: string | number) => positionOf(images, String(id)) ?? 0;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t(locale, "orders.dnd.start", { n: numberOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t(locale, "orders.dnd.over", { n: numberOf(active.id), to: numberOf(over.id) }) : undefined,
    onDragEnd: ({ active, over }) => {
      const to = dragTarget(images, String(active.id), over ? String(over.id) : null);
      return to === null
        ? t(locale, "orders.dnd.cancel", { n: numberOf(active.id) })
        : t(locale, "orders.moved", { from: numberOf(active.id), n: to });
    },
    onDragCancel: ({ active }) => t(locale, "orders.dnd.cancel", { n: numberOf(active.id) }),
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const image = images.find((img) => img.id === String(e.active.id));
    const to = dragTarget(images, String(e.active.id), e.over ? String(e.over.id) : null);
    if (image !== undefined && to !== null) void moveTo(image, to, { announce: false, focusMenu: false });
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
  const summary = resultSummary(locale, assignment.counts);
  const hasResults = assignment.counts.results > 0;

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
          actions={
            images.length > 0 ? (
              <ButtonLink variant="secondary" href={orderDeliveryHref(assignmentId)}>
                {deliveryLinkText(locale, deliveryFileCount({ images: images.length, approved: assignment.counts.approved }))}
              </ButtonLink>
            ) : undefined
          }
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {showStartedBanner(startedCount, bannerClosed, processing) && (
        <Card padding="sm" className="mb-6 flex items-start gap-2">
          <p className="min-w-0 flex-1 py-3 text-sm text-ink" role="status">
            {startedCount === 1
              ? t(locale, "orders.startedOne")
              : t(locale, "orders.startedMany", { n: startedCount ?? 0 })}
          </p>
          <button
            type="button"
            onClick={() => {
              setBannerClosed(true);
              titleRef.current?.focus();
            }}
            aria-label={t(locale, "orders.startedClose")}
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink hover:bg-surface-2 ${FOCUS}`}
          >
            <X aria-hidden className="size-5" />
          </button>
        </Card>
      )}

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
          {summary !== "" && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-ink-2" role="status">
                {summary}
              </p>
              {processing && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRefreshKey((n) => n + 1);
                    void fetchAssignment();
                  }}
                >
                  {t(locale, "orders.refresh")}
                </Button>
              )}
            </div>
          )}
          {images.length === 0 ? (
            <p className="text-sm text-ink-2">{t(locale, "orders.imagesEmpty")}</p>
          ) : (
            <>
              {images.length > 1 && <p className="text-[13px] text-ink-2">{t(locale, "orders.dragHint")}</p>}
              {moveError !== null && (
                <p className="text-sm text-red-fg" role="alert">
                  {codeText(locale, "assignmentError", moveError)}
                </p>
              )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                accessibility={{
                  announcements,
                  screenReaderInstructions: { draggable: t(locale, "orders.dnd.instructions") },
                }}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
                <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
                  <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {images.map((image, i) => (
                      <ImageCard
                        key={image.id}
                        assignmentId={assignmentId}
                        image={image}
                        number={i + 1}
                        count={images.length}
                        onRoom={(room) => changeRoom(image, room)}
                        onMove={(action) => moveByMenu(image, action)}
                        onRemove={() => remove(image)}
                      />
                    ))}
                  </ul>
                </SortableContext>
                <DragOverlay>{activeId !== null ? <DragPreview image={images.find((img) => img.id === activeId)} number={numberOf(activeId)} /> : null}</DragOverlay>
              </DndContext>
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {images.length === 0 ? (
            <Button disabled>{t(locale, "orders.next")}</Button>
          ) : (
            <ButtonLink href={orderServicesHref(assignmentId)}>
              {t(locale, hasResults ? "orders.orderMore" : "orders.next")}
            </ButtonLink>
          )}
        </div>
      </div>
    </main>
  );
}

/** Kortet som foelger pekeren mens det dras: loeftet litt, med miniatyren og nummeret. */
function DragPreview({ image, number }: { image: AssignmentImage | undefined; number: number }) {
  const locale = useLocale();
  if (image === undefined) return null;
  return (
    <div className="flex scale-[1.02] cursor-grabbing items-center gap-3 rounded-card border border-ink bg-surface p-3 ring-1 ring-ink">
      <span className="flex aspect-[4/3] w-24 shrink-0 items-center justify-center overflow-hidden rounded-button bg-surface-2">
        {image.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.thumbUrl} alt={t(locale, "orders.imageAlt", { n: number })} className="h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 truncate text-sm">
        <span className="font-medium text-ink">{number}.</span> <span className="text-ink-2">{image.room ?? image.fileName}</span>
      </span>
    </div>
  );
}
