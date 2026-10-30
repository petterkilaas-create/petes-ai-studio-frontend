"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAssignment } from "../../hooks/useAssignment";
import { useQuota } from "../../hooks/useQuota";
import { orderAssignmentJobs, resultStatusKey, type Assignment } from "../../lib/assignments";
import { browserStorage, clearDraft, loadDraft, saveDraft, uniqueItems, type BoardItem } from "../../lib/board";
import {
  activeResults,
  boardServices,
  boardTotals,
  imageName,
  itemLabel,
  itemsByImage,
  quotaPlan,
  resultLabel,
  serviceNameKey,
  totalsText,
} from "../../lib/brett";
import {
  CallKeys,
  notStartedText,
  ORDER_CALL_TIMEOUT_MS,
  outcomeCounts,
  sendRemaining,
  startPlan,
  stopText,
  totalItems,
  unsentItems,
  type StartProgress,
  type StartStop,
} from "../../lib/orderStart";
import { orderImagesHref, orderServicesHref, orderStartedHref } from "../../lib/ordrer";
import { OneAtATime } from "../../lib/orderProgress";
import { quotaView } from "../../lib/quota";
import { ORDERS_PATH } from "../../lib/services";
import { LoadState } from "./LoadState";
import { OrderProgress } from "./OrderProgress";
import { QuotaNotice } from "../QuotaNotice";
import { Button, ButtonLink } from "../ui/Button";
import { Card, cardClass } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { FOCUS } from "../godkjenning/classes";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Oppsummeringen (TG-NEW-277, FE-3; skissen «Kontroll»): antall bilder,
 * resultater per tjeneste, bildene som bare leveres som original, kvoten
 * (GET /v1/quota; admin «ubegrenset») og «Start behandling». Det bildet har
 * fra foer, vises og sendes (Petter 30.10, valg A): backend stopper samme
 * tjeneste og valg med `service_already_on_image` uten trekk, og svaret viser
 * «Finnes allerede».
 *
 * Start (orderStart.ts): kall paa hoeyst 80 elementer, ett om gangen, ny
 * Idempotency-Key per kall og samme bare ved nytt forsoek etter nettfeil. Etter
 * hvert kall som gikk, staar bare resten igjen i utkastet. Naar alt er sendt,
 * toemmes utkastet; er alt startet, gaar megleren til bildesiden, ellers vises
 * svaret per element her.
 *
 * Fremdriftslinja (Dag 59) er steg 3: «Start behandling» staar i linja, med
 * samme handling og samme graa/aktiv-logikk. Fremdriften og svarene blir
 * staaende paa siden. `once` (OneAtATime) stopper et dobbeltklikk foer React
 * har tegnet knappen graa. Uten utkast og etter svaret staar knappene i
 * kortet som foer, og linja har ingen hovedknapp. Lenken oeverst gaar til
 * ordrene (valg 2A).
 */
export function OrderCheck({ assignmentId }: { assignmentId: string }) {
  const locale = useLocale();
  const router = useRouter();
  const quota = useQuota();
  const [items, setItems] = useState<BoardItem[]>([]);
  const [progress, setProgress] = useState<StartProgress | null>(null);
  const [stop, setStop] = useState<StartStop | null>(null);
  const [running, setRunning] = useState(false);
  const keys = useRef(new CallKeys());
  const once = useRef(new OneAtATime());

  const onLoaded = useCallback(
    (assignment: Assignment) => {
      const draft = loadDraft(browserStorage(), assignmentId, assignment.images.map((img) => img.id));
      setItems(uniqueItems(draft?.items ?? []));
    },
    [assignmentId]
  );
  const { load, reload, request } = useAssignment(assignmentId, onLoaded);

  if (load.kind !== "ok") return <LoadState load={load} onRetry={() => void reload()} />;

  const { assignment } = load;
  const images = assignment.images;
  const totals = boardTotals(images, items);
  const plan = quotaPlan(quota.quota, totals.quotaItems);
  const numberOf = (imageId: string) => images.findIndex((img) => img.id === imageId) + 1;
  const where = (item: BoardItem | null) => {
    if (item === null) return null;
    const n = numberOf(item.imageId);
    return n > 0 ? { imageNumber: n, label: itemLabel(locale, item) } : null;
  };

  async function start() {
    if (running) return;
    setRunning(true);
    setStop(null);
    const from = progress ?? startPlan(items);
    setProgress(from);
    const storage = browserStorage();
    const result = await sendRemaining(from, {
      keys: keys.current,
      send: (wire, idempotencyKey) =>
        orderAssignmentJobs(request, {
          id: assignmentId,
          items: wire,
          idempotencyKey,
          signal: AbortSignal.timeout(ORDER_CALL_TIMEOUT_MS),
        }),
      onProgress: (p) => {
        setProgress(p);
        // Det som er sendt, sendes ikke paa nytt om siden lastes inn igjen.
        saveDraft(storage, assignmentId, unsentItems(p));
        if (p.quota !== null) quota.apply({ kind: "accepted", quota: p.quota });
      },
    });
    setProgress(result.progress);
    setStop(result.stop);
    setRunning(false);
    if (result.stop.kind !== "done") return;
    clearDraft(storage, assignmentId);
    const counts = outcomeCounts(result.progress.outcomes);
    if (counts.notStarted === 0) router.push(orderStartedHref(assignmentId, counts.started));
  }

  const done = stop?.kind === "done" && progress !== null;
  const total = progress === null ? totals.results : totalItems(progress);
  const sentItems = progress === null ? 0 : progress.outcomes.length;

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
        <PageHeader title={t(locale, "check.title")} subtitle={<span className="break-words">{assignment.address}</span>} />
      </div>

      {done ? (
        <Outcomes assignmentId={assignmentId} progress={progress} images={images} quotaShown={quotaView(quota.quota)} />
      ) : items.length === 0 ? (
        <Card padding="md">
          <p className="mb-4 text-sm text-ink">{t(locale, "check.empty")}</p>
          <ButtonLink href={orderServicesHref(assignmentId)}>{t(locale, "check.editBoard")}</ButtonLink>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Card padding="md">
            <p className="text-sm font-medium text-ink">{totalsText(locale, totals)}</p>
            <ul className="mt-4 flex flex-col gap-1 text-sm">
              {boardServices()
                .filter((s) => totals.perService[s] > 0)
                .map((s) => (
                  <li key={s} className="flex justify-between gap-4">
                    <span className="text-ink">{t(locale, serviceNameKey(s))}</span>
                    <span className="text-ink-2">
                      {totals.perService[s] === 1
                        ? t(locale, "check.countOne")
                        : t(locale, "check.countMany", { n: totals.perService[s] })}
                    </span>
                  </li>
                ))}
            </ul>
            <div className="mt-4 border-t border-line pt-4 text-sm text-ink-2">
              {plan.kind === "unlimited" && <p>{t(locale, "check.quota.unlimited")}</p>}
              {plan.kind === "unknown" && <p>{t(locale, "check.quota.unknown")}</p>}
              {plan.kind === "limited" &&
                (plan.over > 0 ? (
                  <p className="text-amber-fg">{t(locale, "check.quota.over", { remaining: plan.remaining, over: plan.over })}</p>
                ) : (
                  <p>{t(locale, "check.quota.need", { need: plan.need, remaining: plan.remaining })}</p>
                ))}
              {totals.perService.skjul_ansikter > 0 && plan.kind === "limited" && (
                <p className="mt-1">{t(locale, "check.quota.free")}</p>
              )}
            </div>
          </Card>

          <section aria-labelledby="check-per-image" className="flex flex-col gap-3">
            <h2 id="check-per-image" className="text-lg font-medium text-ink">
              {t(locale, "check.perImage")}
            </h2>
            <ul className="flex flex-col gap-2">
              {itemsByImage(images, items).map(({ image, number, items: chosen }) => {
                const before = activeResults(image);
                return (
                  <li key={image.id} className={cardClass("none", "flex gap-3 p-3")}>
                    <span className="flex aspect-[4/3] w-20 shrink-0 items-center justify-center overflow-hidden rounded-button bg-surface-2">
                      {image.thumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="break-words font-medium text-ink">{imageName(image, number)}</p>
                      {chosen.length > 0 && (
                        <ul className="mt-1 text-ink">
                          {chosen.map((item) => (
                            <li key={`${item.service}|${item.option ?? ""}|${JSON.stringify(item.fields ?? {})}`}>
                              {itemLabel(locale, item)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {before.map((r) => (
                        <p key={r.resultId} className="mt-1 text-[13px] text-ink-2">
                          {t(locale, "check.hasBefore", {
                            label: resultLabel(locale, r),
                            status: t(locale, resultStatusKey(r.displayStatus, r.previousVersion)),
                          })}
                        </p>
                      ))}
                      {chosen.length === 0 && before.length === 0 && (
                        <p className="mt-1 text-ink-2">{t(locale, "check.originalOnly")}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {images.some((img) => activeResults(img).length > 0) && (
              <p className="text-[13px] text-ink-2">{t(locale, "check.hasBeforeNote")}</p>
            )}
          </section>

          <Card padding="md">
            <p className="text-sm font-medium text-ink">{t(locale, "check.afterTitle")}</p>
            <p className="mt-1 text-sm text-ink-2">{t(locale, "check.afterBody")}</p>
          </Card>

          <div role="status" aria-live="polite" className="text-sm">
            {running && <p className="text-ink-2">{t(locale, "check.starting", { done: sentItems, total })}</p>}
            {stop?.kind === "network" && <p className="text-red-fg">{t(locale, "check.networkError")}</p>}
            {stop?.kind === "error" && (
              <div className="text-red-fg">
                <p className="font-medium">{t(locale, "check.startError")}</p>
                <p>{stopText(locale, stop, where(stop.item))}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <OrderProgress
        page="check"
        assignment={assignment}
        draftCount={items.length}
        primary={
          !done && items.length > 0 ? (
            <Button onClick={() => void once.current.run(start)} disabled={running || stop?.kind === "error"}>
              {stop?.kind === "network"
                ? t(locale, "check.retry")
                : total === 1
                  ? t(locale, "check.startOne")
                  : t(locale, "check.startMany", { n: total })}
            </Button>
          ) : null
        }
      />
    </main>
  );
}

/** Svaret per element naar noe ikke ble startet (ellers gaar siden rett til bildene). */
function Outcomes({
  assignmentId,
  progress,
  images,
  quotaShown,
}: {
  assignmentId: string;
  progress: StartProgress;
  images: Assignment["images"];
  quotaShown: ReturnType<typeof quotaView>;
}) {
  const locale = useLocale();
  const counts = outcomeCounts(progress.outcomes);
  return (
    <div className="flex flex-col gap-6">
      <Card padding="md" role="status">
        <p className="text-sm font-medium text-ink">{t(locale, "check.doneTitle")}</p>
        <p className="mt-1 text-sm text-ink-2">
          {t(locale, "check.doneSummary", { started: counts.started, notStarted: counts.notStarted })}
        </p>
      </Card>
      <ul className="flex flex-col gap-2">
        {progress.outcomes.map((o, i) => {
          const n = images.findIndex((img) => img.id === o.item.imageId);
          return (
            <li key={i} className={cardClass("none", "flex flex-col gap-1 p-3 text-sm")}>
              <p className="text-ink">
                {n >= 0 ? `${imageName(images[n], n + 1)} · ` : ""}
                {itemLabel(locale, o.item)}
              </p>
              <p className={o.started ? "text-green-fg" : "text-amber-fg"}>
                {o.started ? t(locale, "check.outcomeStarted") : notStartedText(locale, o.code)}
              </p>
            </li>
          );
        })}
      </ul>
      <QuotaNotice view={quotaShown} locale={locale} />
      <div>
        <ButtonLink href={orderImagesHref(assignmentId)}>{t(locale, "check.toImages")}</ButtonLink>
      </div>
    </div>
  );
}
