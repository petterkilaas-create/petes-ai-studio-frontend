"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  getCapabilities,
  getReview,
  NO_CAPABILITIES,
  postDecision,
  type Capabilities,
  type DecisionAction,
  type ReviewFetchResult,
} from "@/app/lib/api";
import { useJobStatus } from "@/app/lib/useJobStatus";
import { codeText, t, type CodeGroup, type UiKey } from "@/app/lib/i18n";
import { useLocale } from "@/app/lib/i18n/useLocale";
import {
  buildDecision,
  decisionControls,
  outcome,
  resultImageUrl,
  shouldPoll,
  type FireplaceAnswer,
} from "@/app/lib/review";
import { isReadOnlyOther, showDetails } from "@/app/lib/roles";
import {
  buildCorrection,
  canSubmitCorrection,
  correctionControls,
  correctionFireplaceShown,
  correctionResult,
  initialToggles,
  needsConfirmation,
  previousFireplaceAnswer,
  setToggle,
  type Toggles,
} from "@/app/lib/correction";
import { runDecision } from "@/app/lib/decide";
import { canDownload } from "@/app/lib/download";
import { compareVariants, selectedVariant, variantLabel } from "@/app/lib/compare";
import { PreviewPlaceholder } from "@/app/components/PreviewPlaceholder";
import { buttonClass } from "@/app/components/ui/Button";
import { cardClass } from "@/app/components/ui/Card";
import { CompareViewer } from "@/app/components/godkjenning/CompareViewer";
import { VariantPicker } from "@/app/components/godkjenning/VariantPicker";
import { DecisionCard } from "@/app/components/godkjenning/DecisionCard";
import { CorrectionPanel } from "@/app/components/godkjenning/CorrectionPanel";
import { MoodPanel } from "@/app/components/godkjenning/MoodPanel";
import { DetailsPanel } from "@/app/components/godkjenning/DetailsPanel";
import { DisclosureBlock } from "@/app/components/godkjenning/DisclosureBlock";
import { DownloadButton } from "@/app/components/godkjenning/DownloadButton";
import { FOCUS } from "@/app/components/godkjenning/classes";

/**
 * Godkjenningssiden (2d-1): megleren avgjoer egne jobber i «Til kontroll»
 * (awaiting_approval) og «Til gjennomgang» (needs_review).
 *
 * Tilgang sjekkes i backend (fremmed eller ukjent jobb gir 404). Knappene
 * styres av `allowed_actions`; all tekst og alle koder gaar via ordlista.
 * Ingen pris vises, fordi eksterne kunder skal bruke siden.
 *
 * «Rett» (2d-2b): megleren slaar kandidater paa og godkjente av, og lager
 * et nytt bilde fra originalen. Antall runder kommer fra backend.
 *
 * D2 (brief §4): stort bilde med slider og varianter (D2a), og ved siden av
 * handlingene i ett kort, stemning og lys, og «Detaljer» bare for admin
 * (D2b). Siden holder tilstanden og alle kall; komponentene viser.
 */

type LoadState = { kind: "loading" } | ReviewFetchResult;

/** Melding etter en avgjoerelse: ui-tekst eller kode fra backend. */
type Message = { key: UiKey } | { group: CodeGroup; code: string | null };

const CARD = cardClass("md");
const BTN_PRIMARY = buttonClass("primary");

export default function GodkjenningPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const { getToken } = useAuth();
  const locale = useLocale();

  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  // Valgt variant i «Sammenlign originalen med»; null gir gjeldende runde.
  const [variantId, setVariantId] = useState<string | null>(null);
  // Admin (view_all fra /me) ser rått. Feil eller manglende svar: ikke admin.
  const [caps, setCaps] = useState<Capabilities>(NO_CAPABILITIES);
  const [answer, setAnswer] = useState<FireplaceAnswer>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  // «Korriger bildet» (2d-2b). Bryterne holdes paa key og nullstilles ved Avbryt.
  const [editing, setEditing] = useState(false);
  const [toggles, setToggles] = useState<Toggles>({});
  const [correctAnswer, setCorrectAnswer] = useState<FireplaceAnswer>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  // Synkront vern mot dobbeltklikk; busy-state rekker ikke aa oppdatere
  // mellom to raske klikk. Backend har ogsaa eget vern.
  const inFlight = useRef(false);
  // Etter 202 (continue), eller naar siden aapnes mens jobben kjoerer: poll
  // med den eksisterende mekanismen til jobben er ferdig eller venter igjen,
  // og hent saa review paa nytt.
  const [pollJobId, setPollJobId] = useState<string | null>(null);
  const runningOnLoad = load.kind === "ok" && shouldPoll(load.review.status);
  const activePollId = pollJobId ?? (runningOnLoad ? jobId : null);
  const job = useJobStatus(activePollId);

  const fetchReview = useCallback(async () => {
    let result: ReviewFetchResult;
    try {
      result = await getReview({ jobId, getToken });
    } catch {
      result = { kind: "error", httpStatus: 0 };
    }
    setLoad(result);
    setPollJobId(null);
    // Etter en ny runde eller avgjoerelse vises gjeldende runde igjen.
    setVariantId(null);
  }, [jobId, getToken]);

  useEffect(() => {
    let cancelled = false;
    void getCapabilities({ getToken }).then((c) => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    // setLoad kjoerer foerst etter await i fetchReview, ikke synkront i effekten.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchReview();
  }, [fetchReview]);

  // Ender pollingen uten at review er endret (f.eks. ukjent status), poller
  // vi ikke paa nytt: activePollId er den samme, saa useJobStatus starter ikke igjen.
  const pollDone = activePollId !== null && job.status !== "idle" && job.status !== "pending";
  useEffect(() => {
    // Som over: setState skjer etter await i fetchReview.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pollDone) void fetchReview();
  }, [pollDone, fetchReview]);

  const retry = () => {
    setLoad({ kind: "loading" });
    void fetchReview();
  };

  const polling = activePollId !== null && !pollDone;
  const locked = busy || blocked || polling;

  const decide = (action: DecisionAction) => {
    if (locked || load.kind !== "ok") return;
    const review = load.review;
    void runDecision({
      inFlight,
      send: () =>
        postDecision({ jobId, decision: buildDecision(action, reasonText, answer, review), getToken }),
      // Etter 200 og 409 status_changed (ny versjon, TG-NEW-130).
      refetch: fetchReview,
      onStart: () => {
        setBusy(true);
        setMessage(null);
      },
      onError: () => setMessage({ key: "decision.error" }),
      onSettled: () => setBusy(false),
      handle: (out) => {
        switch (out.kind) {
          case "updated":
            setRejectOpen(false);
            setReasonText("");
            break;
          case "poll":
            setRejectOpen(false);
            setPollJobId(jobId);
            break;
          case "status_changed":
            setRejectOpen(false);
            setMessage({ key: "decision.statusChanged" });
            break;
          case "blocked":
            setMessage({ group: "decisionError", code: out.code });
            // 409: ingen ny handling. 422 (ugyldig body, f.eks. begrunnelsen)
            // kan rettes av megleren, saa knappene blir staaende.
            if (out.code !== "invalid_decision") setBlocked(true);
            break;
          case "not_found":
            setLoad({ kind: "not_found" });
            break;
          case "unavailable":
            setMessage({ group: "decisionError", code: out.code });
            break;
          case "error":
            setMessage({ key: "decision.error" });
            break;
        }
      },
    });
  };

  const startCorrection = () => {
    if (load.kind !== "ok") return;
    setToggles(initialToggles(load.review.lights));
    setCorrectAnswer(previousFireplaceAnswer(load.review.fireplace));
    setConfirmed(false);
    setRejectOpen(false);
    setMessage(null);
    setEditing(true);
  };

  const cancelCorrection = () => {
    setEditing(false);
    setToggles({});
    setConfirmed(false);
  };

  const submitCorrection = () => {
    if (load.kind !== "ok" || locked) return;
    const review = load.review;
    void runDecision({
      inFlight,
      send: () =>
        postDecision({
          jobId,
          decision: buildCorrection(
            review,
            toggles,
            correctionFireplaceShown(review.fireplace),
            correctAnswer
          ),
          getToken,
        }),
      // Etter 200 og 409 status_changed (ny versjon, TG-NEW-130).
      refetch: fetchReview,
      onStart: () => {
        setBusy(true);
        setMessage(null);
      },
      onError: () => setMessage({ key: "decision.error" }),
      onSettled: () => setBusy(false),
      handle: (out) => {
        const result = correctionResult(out);
        switch (result.kind) {
          case "poll":
            cancelCorrection();
            setPollJobId(jobId);
            break;
          case "reload":
            cancelCorrection();
            setMessage(result.message);
            break;
          case "limit":
            cancelCorrection();
            setLimitReached(true);
            setMessage(result.message);
            break;
          case "blocked":
            setMessage(result.message);
            setBlocked(true);
            break;
          case "retry":
            // 422 og 503: valgene staar, saa brukeren kan proeve igjen.
            setMessage(result.message);
            break;
          case "not_found":
            setLoad({ kind: "not_found" });
            break;
        }
      },
    });
  };

  const messageText =
    message === null
      ? null
      : "key" in message
        ? t(locale, message.key)
        : codeText(locale, message.group, message.code);

  return (
    <div className="flex flex-col">
      <main className="max-w-6xl mx-auto w-full p-4 sm:p-8 flex-1 flex flex-col gap-6">
        <div>
          <Link
            href="/history"
            className={`inline-flex min-h-11 items-center rounded-button text-sm text-ink-2 hover:text-ink ${FOCUS}`}
          >
            ← {t(locale, "review.back")}
          </Link>
          <h1 className="font-display text-[32px] md:text-[40px] leading-tight text-ink mt-2 mb-1">
            {t(locale, "review.title")}
          </h1>
          <p className="text-ink-2 text-xs font-mono break-all">{jobId}</p>
        </div>

        {load.kind === "loading" && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-4 border-line border-t-ink rounded-full animate-spin motion-reduce:animate-none" />
            <p className="text-ink-2 text-sm">
              {t(locale, "review.loading")}
            </p>
          </div>
        )}

        {load.kind === "not_found" && (
          <div className={`${CARD} text-center max-w-lg mx-auto`}>
            <p className="text-ink font-bold text-lg mb-2">{t(locale, "review.notFound")}</p>
            <p className="text-ink-2 text-sm">{t(locale, "review.notFoundHint")}</p>
          </div>
        )}

        {(load.kind === "unavailable" || load.kind === "error") && (
          <div className={`${CARD} text-center max-w-lg mx-auto`}>
            <p className="text-ink text-sm mb-6">
              {load.kind === "unavailable"
                ? t(locale, "review.unavailable")
                : t(locale, "review.loadError")}
            </p>
            <button onClick={retry} className={BTN_PRIMARY}>
              {t(locale, "review.retry")}
            </button>
          </div>
        )}

        {load.kind === "ok" &&
          (() => {
            const review = load.review;
            const controls = decisionControls(review, answer);
            const done = outcome(review);
            const variants = compareVariants(review.images, { isAdmin: caps.viewAll });
            const shown = selectedVariant(variants, variantId);
            // Gamle jobber uten rounds: lenken velges fra de merkede feltene som foer.
            // Runder: lenken som den er, null gir plassholder (ingen tilbakefall).
            const shownUrl =
              shown === null
                ? null
                : shown.source.kind === "legacy"
                  ? resultImageUrl(review.images, shown.source.variant)
                  : shown.source.url;
            const correction = correctionControls(review);
            const canCorrect = correction.show && !limitReached && done === null;
            const isEditing = editing && canCorrect;
            const fireplaceShown = correctionFireplaceShown(review.fireplace);
            const correctionBody = buildCorrection(review, toggles, fireplaceShown, correctAnswer);
            const overrides = correctionBody.overrides ?? { promote: [], disable: [], add: [] };
            const confirmNeeded = needsConfirmation(overrides);
            const submitEnabled = canSubmitCorrection({
              overrides,
              confirmed,
              fireplaceShown,
              answer: correctAnswer,
            });

            const readOnly = isReadOnlyOther(review);

            return (
              <>
                {readOnly && (
                  // TG-NEW-127: admin paa en annen brukers jobb. Knappene styres
                  // fortsatt bare av allowed_actions, som da er tom.
                  <p
                    className="text-sm text-neutral-fg bg-neutral-bg rounded-button p-3"
                    role="status"
                  >
                    {t(locale, "review.readOnlyOther")}
                  </p>
                )}

                {/* Stort bilde til venstre, handlinger og stemning ved siden av. Paa mobil under hverandre. */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  <section className={`${CARD} lg:col-span-2 flex flex-col gap-6 min-w-0`}>
                    <VariantPicker
                      variants={variants}
                      selectedId={shown?.id ?? null}
                      onSelect={setVariantId}
                      locale={locale}
                    />
                    <CompareViewer
                      originalUrl={review.images.originalUrl}
                      result={shown === null ? null : { url: shownUrl, label: variantLabel(locale, shown) }}
                      placeholder={<PreviewPlaceholder />}
                      locale={locale}
                    />
                  </section>

                  <div className="flex flex-col gap-6 min-w-0">
                    {done !== null ? (
                      // Nedlasting og tekst til annonsen der resultatet vises (etter godkjenning).
                      <section className={CARD}>
                        <p className="text-ink font-bold">{t(locale, done.key)}</p>
                        {done.reason && (
                          <p className="text-sm text-ink mt-2 break-words">
                            {t(locale, "review.reasonLabel")}: {done.reason}
                          </p>
                        )}
                        {canDownload(review) && <DownloadButton jobId={review.jobId} locale={locale} />}
                        {review.status === "succeeded" && (
                          <DisclosureBlock disclosure={review.disclosure} locale={locale} />
                        )}
                        {messageText !== null && (
                          <p
                            className="mt-6 text-sm text-amber-fg bg-amber-bg rounded-button p-3"
                            role="status"
                          >
                            {messageText}
                          </p>
                        )}
                      </section>
                    ) : (
                      <DecisionCard
                        reviewCode={review.code}
                        controls={controls}
                        canCorrect={canCorrect}
                        roundFailed={correction.roundFailed}
                        readOnly={readOnly}
                        locked={locked}
                        busy={busy}
                        polling={polling}
                        answer={answer}
                        onAnswer={setAnswer}
                        rejectOpen={rejectOpen}
                        onRejectOpen={setRejectOpen}
                        reasonText={reasonText}
                        onReasonText={setReasonText}
                        onDecide={decide}
                        onStartCorrection={startCorrection}
                        correction={
                          isEditing ? (
                            <CorrectionPanel
                              lights={review.lights}
                              toggles={toggles}
                              onToggle={(light, uncertain, on) =>
                                setToggles((prev) => setToggle(prev, light, uncertain, on))
                              }
                              fireplaceShown={fireplaceShown}
                              answer={correctAnswer}
                              onAnswer={setCorrectAnswer}
                              confirmNeeded={confirmNeeded}
                              confirmed={confirmed}
                              onConfirmed={setConfirmed}
                              roundsLeft={correction.roundsLeft}
                              submitEnabled={submitEnabled}
                              onSubmit={submitCorrection}
                              onCancel={cancelCorrection}
                              locked={locked}
                              locale={locale}
                            />
                          ) : null
                        }
                        message={messageText}
                        locale={locale}
                      />
                    )}

                    <MoodPanel review={review} locale={locale} />

                    {/* Analysen bare for admin (brief §3 punkt 6). */}
                    {showDetails(caps) && <DetailsPanel review={review} locale={locale} />}
                  </div>
                </div>
              </>
            );
          })()}
      </main>
    </div>
  );
}
