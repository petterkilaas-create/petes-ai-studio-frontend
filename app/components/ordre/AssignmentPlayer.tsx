"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { DecisionAction } from "../../lib/api";
import type { Assignment, AssignmentImage } from "../../lib/assignments";
import { useAssignment } from "../../hooks/useAssignment";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { ORDER_REFRESH_MAX_MS } from "../../lib/autoRefresh";
import {
  isProcessing,
  keepImageUrls,
  orderDeliveryHref,
  orderImagesHref,
  orderServicesHref,
  URL_REFRESH_MS,
} from "../../lib/ordrer";
import { deliveryFileCount, deliveryLinkText } from "../../lib/delivery";
import {
  assignmentProgress,
  imagePos,
  imageStep,
  jumpsAfter,
  nextState,
  pageArrow,
  playerHref,
  posLabel,
  progressText,
  resolvePos,
  UNDO_NOTICE_MS,
  type PlayerPos,
} from "../../lib/player";
import { ORDERS_PATH } from "../../lib/services";
import { ResultReview } from "../godkjenning/ResultReview";
import { FOCUS } from "../godkjenning/classes";
import { ButtonLink, Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { LoadState } from "./LoadState";
import { ImageStrip } from "./ImageStrip";
import { PANEL_ID, ResultTabs, tabId } from "./ResultTabs";
import { UndoNotice, type Undo } from "./UndoNotice";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Ordresiden, «spilleren» (TG-NEW-277, FE-4; skissen «Ordre», Petter 28.10):
 * originalen og alle resultatene i ordren, for godkjenning, retting og
 * nedlasting.
 *
 * - Toppen: adressen, fremdriften («6 av 9 kontrollert · 1 behandles»),
 *   «Last ned (N filer)», «Bestill mer for boligen» (brettet) og «Bilder og rom».
 * - Bildestripa (ImageStrip) og fanene per tjeneste (ResultTabs).
 * - ResultReview er innebygd for valgt resultat, med `key={resultId}`, saa
 *   tilstanden er ny for hvert resultat. Et bilde uten resultater: «Leveres
 *   som original».
 *
 * Valgt bilde og resultat holdes i tilstanden og skrives til adressen
 * (`?bilde=&resultat=`) med router.replace. Adressen leses bare ved start
 * (resolvePos), saa et klikk ikke venter paa serveren.
 *
 * Etter «Godkjenn» og «Avvis» hentes ordren, og siden hopper til neste som
 * venter (nextState), med meldingen «Godkjent: …» / «Avvist: …» og «Angre»
 * i ca. 10 sekunder (UndoNotice, Petter 30.10). Er ingen igjen, blir siden
 * staaende, og under resultatet staar «Ingen flere nå, N behandles» eller
 * «Alt er kontrollert. Gå til nedlasting».
 *
 * Piltastene ←/→ blar mellom bildene naar fokus ikke er i et felt, paa
 * lerretet eller i lysboksen (pageArrow). Mens noe behandles, hentes ordren
 * hvert 5. sekund (som bildesiden), og lenkene til miniatyrene beholdes i
 * 45 minutter (keepImageUrls).
 */
export function AssignmentPlayer({
  assignmentId,
  imageId,
  resultId: resultParam,
}: {
  assignmentId: string;
  /** `?bilde=` fra adressen (parsePlayerParam), eller null. */
  imageId: string | null;
  /** `?resultat=` fra adressen, eller null. */
  resultId: string | null;
}) {
  const locale = useLocale();
  const router = useRouter();

  const [images, setImages] = useState<readonly AssignmentImage[]>([]);
  // Siste bildene, til hoppet etter en avgjoerelse (staten er ikke oppdatert rett etter reload).
  const imagesRef = useRef<readonly AssignmentImage[]>([]);
  const urlsAt = useRef(0);
  const onLoaded = useCallback((assignment: Assignment) => {
    const now = Date.now();
    const keep = now - urlsAt.current < URL_REFRESH_MS;
    if (!keep) urlsAt.current = now;
    const next = keepImageUrls(imagesRef.current, assignment.images, keep);
    imagesRef.current = next;
    setImages(next);
  }, []);
  const { load, reload } = useAssignment(assignmentId, onLoaded);

  // Valgt plass: fra adressen ved start, deretter fra klikk, taster og hopp.
  const [selected, setSelected] = useState<{ imageId: string | null; resultId: string | null }>({
    imageId,
    resultId: resultParam,
  });
  const pos = resolvePos(images, selected.imageId, selected.resultId);
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  });

  const [undo, setUndo] = useState<Undo | null>(null);
  const [undoneText, setUndoneText] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  const select = useCallback(
    (next: PlayerPos, opts: { focus?: boolean } = {}) => {
      if (opts.focus) focusHeading.current = true;
      setSelected(next);
      router.replace(playerHref(assignmentId, next), { scroll: false });
    },
    [assignmentId, router]
  );

  // Etter hoppet: fokus paa overskriften til resultatet (knappen som ble trykket, er borte).
  useEffect(() => {
    if (focusHeading.current) {
      focusHeading.current = false;
      headingRef.current?.focus();
    }
  }, [pos?.imageId, pos?.resultId]);

  const [refreshKey, setRefreshKey] = useState(0);
  const processing = load.kind === "ok" && isProcessing(load.assignment);
  useAutoRefresh(processing, reload, refreshKey, ORDER_REFRESH_MAX_MS);

  // Fra ResultReview: hent ordren paa nytt, og hopp videre etter «Godkjenn» og «Avvis».
  const onChanged = useCallback(
    async (action?: DecisionAction) => {
      const from = posRef.current;
      await reload();
      setRefreshKey((n) => n + 1);
      if (action === undefined || !jumpsAfter(action) || from === null || from.resultId === null) return;
      const state = nextState(imagesRef.current, from);
      if (state.kind !== "next") return;
      setUndoneText("");
      setUndo({ action, resultId: from.resultId, label: posLabel(locale, imagesRef.current, from) });
      select(state.pos, { focus: true });
    },
    [reload, select, locale]
  );

  // «Angre» i meldingen: hent ordren, og gaa tilbake til resultatet (det er «Til godkjenning» igjen).
  const onUndone = useCallback(
    async (resultId: string) => {
      const label = undo?.label ?? "";
      setUndo(null);
      await reload();
      const back = resolvePos(imagesRef.current, null, resultId);
      if (back !== null) select(back, { focus: true });
      setUndoneText(t(locale, "player.undo.done", { label }));
    },
    [undo, reload, select, locale]
  );
  const closeUndo = useCallback(() => setUndo(null), []);
  // «… står som «Til godkjenning» igjen.» forsvinner som meldingen.
  useEffect(() => {
    if (undoneText === "") return;
    const id = window.setTimeout(() => setUndoneText(""), UNDO_NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [undoneText]);

  // ←/→ paa hele siden: forrige eller neste bilde (ikke i felt, lerret, glider, faner eller lysboksen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || posRef.current === null) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const dir = pageArrow(
        e.key,
        {
          tag: el?.tagName ?? "",
          role: el?.getAttribute("role") ?? null,
          editable: el?.isContentEditable ?? false,
          modal: el?.closest("dialog, [role=dialog], [aria-modal=true]") != null,
        },
        { alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }
      );
      if (dir === null) return;
      const next = imageStep(imagesRef.current, posRef.current, dir);
      if (next === null) return;
      e.preventDefault();
      select(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  if (load.kind !== "ok") return <LoadState load={load} onRetry={() => void reload()} />;

  const { assignment } = load;
  const progress = assignmentProgress(images);
  const image = pos === null ? undefined : images.find((img) => img.id === pos.imageId);
  const number = image === undefined ? 0 : images.indexOf(image) + 1;
  const resultId = pos?.resultId ?? null;
  const next = nextState(images, pos);

  return (
    <main className="mx-auto w-full max-w-[1360px] min-w-0 px-4 py-8 md:px-8 md:py-12">
      <Link
        href={ORDERS_PATH}
        className={`mb-6 inline-flex min-h-11 items-center gap-2 rounded-button text-sm text-ink-2 hover:text-ink ${FOCUS}`}
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        {t(locale, "orders.back")}
      </Link>

      <div className="mb-6 flex flex-col gap-3">
        <PageHeader
          title={<span className="break-words">{assignment.address}</span>}
          subtitle={assignment.assignmentNo ? t(locale, "orders.assignmentNo", { no: assignment.assignmentNo }) : undefined}
          actions={
            images.length > 0 ? (
              <>
                <ButtonLink variant="secondary" href={orderDeliveryHref(assignmentId)}>
                  {deliveryLinkText(locale, deliveryFileCount({ images: images.length, approved: assignment.counts.approved }))}
                </ButtonLink>
                <ButtonLink variant="secondary" href={orderServicesHref(assignmentId)}>
                  {t(locale, "player.orderMore")}
                </ButtonLink>
              </>
            ) : undefined
          }
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {progress.total > 0 && (
            <p className="text-sm text-ink-2" role="status">
              {progressText(locale, progress)}
            </p>
          )}
          {processing && (
            <Button
              variant="secondary"
              onClick={() => {
                setRefreshKey((n) => n + 1);
                void reload();
              }}
            >
              {t(locale, "orders.refresh")}
            </Button>
          )}
          <Link
            href={orderImagesHref(assignmentId)}
            className={`inline-flex min-h-11 items-center rounded-button text-sm text-ink underline ${FOCUS}`}
          >
            {t(locale, "player.images")}
          </Link>
        </div>
      </div>

      {/* Meldingen etter hoppet (Petter 30.10): kunngjoeres, og staar i ca. 10 sekunder. */}
      <div aria-live="polite" className="mb-4 empty:hidden">
        {undo !== null && <UndoNotice key={undo.resultId} undo={undo} onUndone={(id) => void onUndone(id)} onClose={closeUndo} />}
        {undo === null && undoneText !== "" && (
          <p className="rounded-card border border-line bg-surface p-3 text-sm text-ink">{undoneText}</p>
        )}
      </div>

      {images.length === 0 || pos === null || image === undefined ? (
        <Card padding="lg" className="mx-auto max-w-lg text-center">
          <p className="mb-6 text-ink">{t(locale, "player.noImages")}</p>
          <ButtonLink href={orderImagesHref(assignmentId)}>{t(locale, "player.images")}</ButtonLink>
        </Card>
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <ImageStrip images={images} currentId={image.id} onSelect={(img) => select(imagePos(img))} />
            <p className="hidden text-[13px] text-ink-2 md:block">{t(locale, "player.keysHint")}</p>
          </div>

          <section aria-labelledby="player-heading" className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-[13px] text-ink-2">{t(locale, "player.position", { n: number, count: images.length })}</p>
              <h2
                id="player-heading"
                ref={headingRef}
                tabIndex={-1}
                className={`break-words rounded-button text-lg font-medium text-ink ${FOCUS}`}
              >
                {posLabel(locale, images, pos)}
              </h2>
            </div>

            {resultId !== null && (
              <ResultTabs
                results={image.results}
                currentId={resultId}
                onSelect={(r) => select({ imageId: image.id, resultId: r.resultId })}
              />
            )}

            <div
              id={PANEL_ID}
              role={resultId !== null ? "tabpanel" : undefined}
              aria-labelledby={resultId !== null ? tabId(resultId) : undefined}
              className="min-w-0"
            >
              {resultId !== null ? (
                <ResultReview key={resultId} jobId={resultId} from={assignmentId} onChanged={onChanged} embedded />
              ) : (
                <Card padding="md" className="flex flex-col gap-4">
                  <div>
                    <p className="font-medium text-ink">{t(locale, "assignment.status.originalOnly")}</p>
                    <p className="mt-1 text-sm text-ink-2">{t(locale, "player.originalOnlyHint")}</p>
                  </div>
                  {image.originalUrl !== null && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.originalUrl}
                      alt={t(locale, "player.originalAlt", { n: number })}
                      className="max-h-[70vh] w-full rounded-button object-contain"
                    />
                  )}
                </Card>
              )}
            </div>
          </section>

          <div className="flex flex-col gap-2 border-t border-line pt-6">
            {next.kind === "next" && (
              <Button variant="secondary" className="self-start" onClick={() => select(next.pos, { focus: true })}>
                {t(locale, "player.next", { label: posLabel(locale, images, next.pos) })}
              </Button>
            )}
            {next.kind === "waiting" && (
              <p className="rounded-button bg-neutral-bg p-3 text-sm text-neutral-fg" role="status">
                {t(locale, "player.waiting", { n: next.processing })}
              </p>
            )}
            {next.kind === "all_reviewed" && (
              <ButtonLink href={orderDeliveryHref(assignmentId)} className="self-start">
                {t(locale, "player.allReviewedLink")}
              </ButtonLink>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
