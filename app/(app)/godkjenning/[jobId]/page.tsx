"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  getCapabilities,
  getReview,
  NO_CAPABILITIES,
  postDecision,
  type BrightnessStep,
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
  isFireplaceStop,
  isStopped,
  mediaDeleted,
  outcome,
  noteText,
  resultImageUrl,
  reviewNotes,
  shouldPoll,
  stopReasons,
  type FireplaceAnswer,
} from "@/app/lib/review";
import { imageTypeLine } from "@/app/lib/imageType";
import { adminView, isReadOnlyOther, showDetails } from "@/app/lib/roles";
import {
  buildCorrection,
  canSubmitCorrection,
  correctionControls,
  correctionFireplaceShown,
  correctionKind,
  correctionResult,
  initialToggles,
  needsConfirmation,
  previousFireplaceAnswer,
  setToggle,
  type Toggles,
} from "@/app/lib/correction";
import { runDecision } from "@/app/lib/decide";
import { canDownload } from "@/app/lib/download";
import { formatDate } from "@/app/lib/dates";
import {
  approveLocked,
  compareVariants,
  makingImage,
  nextVersion,
  rawCounterpart,
  selectedEntry,
  stripLabel,
  stripShown,
  variantLabel,
  versionStrip,
} from "@/app/lib/compare";
import { canShowMarkers } from "@/app/lib/lightsView";
import { panelShown } from "@/app/lib/presets";
import { canShowAdditions } from "@/app/lib/additions";
import { checklistFor } from "@/app/lib/checklist";
import { framingWarning, orderTabs } from "@/app/lib/orderTabs";
import { doneTitleKey, failedLines, stopDoneKey } from "@/app/lib/notCreated";
import {
  blockedResult,
  brightnessResultUrl,
  brightnessView,
  isApproving,
  preloadUrls,
  selectedStep,
  stepName,
  visibleVariants,
} from "@/app/lib/brightness";
import { PreviewPlaceholder } from "@/app/components/PreviewPlaceholder";
import { buttonClass } from "@/app/components/ui/Button";
import { cardClass } from "@/app/components/ui/Card";
import { CompareViewer } from "@/app/components/godkjenning/CompareViewer";
import { LightMarkers } from "@/app/components/godkjenning/LightMarkers";
import { AdditionMarkers } from "@/app/components/godkjenning/AdditionMarkers";
import { VersionStrip } from "@/app/components/godkjenning/VersionStrip";
import { MakingOverlay } from "@/app/components/godkjenning/MakingOverlay";
import { Lightbox } from "@/app/components/godkjenning/Lightbox";
import { DecisionCard } from "@/app/components/godkjenning/DecisionCard";
import { OrderTabs } from "@/app/components/godkjenning/OrderTabs";
import { CorrectionPanel } from "@/app/components/godkjenning/CorrectionPanel";
import { MoodPanel } from "@/app/components/godkjenning/MoodPanel";
import { WishesPanel } from "@/app/components/godkjenning/WishesPanel";
import { DetailsPanel } from "@/app/components/godkjenning/DetailsPanel";
import { DisclosureBlock } from "@/app/components/godkjenning/DisclosureBlock";
import { DownloadButton } from "@/app/components/godkjenning/DownloadButton";
import { BrightnessApproved, BrightnessControl } from "@/app/components/godkjenning/BrightnessControl";
import { choiceClass, FOCUS } from "@/app/components/godkjenning/classes";

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
 *
 * Lysstyrke (TG-NEW-147): slideren under bildet velger trinn i gjeldende
 * runde, og bildet er trinnets `preview_url` fra backend. Trinnet sendes
 * med godkjenningen. Ny henting starter paa `default_step` igjen.
 *
 * Slettede bilder (TG-NEW-117): naar `media_deleted_at` er satt, vises et
 * banner med datoen og én boks med «Bildet er slettet» i stedet for bildene,
 * varianter og lysstyrke. Backend sender tom `allowed_actions`, og
 * nedlastingen skjules (canDownload). «Tekst til annonsen» staar.
 *
 * Megleren ser bare det hen maa ta stilling til (TG-NEW-193, Petter 10.10):
 * uten view_all skjules job-id, grunnen til at jobben venter, valgene i
 * rundeetiketten, usikre lys (rettingen og markoerene), peisen og «ikke
 * brukt» om himmelen. Admin (adminView) ser alt som foer.
 *
 * Kontrollen av tillegg (TG-NEW-199 PR 4): ved `warning` sendes krysset med
 * som `additions_acknowledged`.
 *
 * Sjekklista og krysset (D-5a, Petter 25.10): én liste per tjeneste
 * (checklistFor) og ett kryss «Jeg har sammenlignet …» som maa settes foer
 * «Godkjenn» for alle nivaaer; ved advarsel setter det ogsaa
 * `acknowledged`. Ingenting nytt sendes til backend. Krysset gjelder per
 * jobb og nullstilles ved hver ny henting (ny runde, 409, avgjoerelse).
 *
 * Bredere visning og lysboks (D-5a): siden er ca. 1360 px (menyen er felles
 * og staar paa 1152 px, Petter 25.10, AVVIK 2 b), saa bildet blir ca. 870 px. «Forstørr» aapner lysboksen med samme bilde,
 * trinn og runder.
 *
 * Fanene per bestilling (D-5c, TG-NEW-249): med minst to jobber i `order`
 * staar en rad med én fane per stil over bildet. Fanene er lenker, saa siden
 * monteres paa nytt ved bytte. Rammevarselet (TG-NEW-260) staar i kortet
 * over sjekklista naar `framing` er maalt og over grensen (orderTabs.ts).
 *
 * Versjonsstripa (FE-c, Dag 57): «Original», «Versjon 1», «Versjon 2 · nå»
 * paa siden og i lysboksen (versionStrip). Med «Original» valgt vises bare
 * originalen. Vises originalen eller en eldre versjon, er «Godkjenn» laast
 * (approveLocked), fordi backend alltid godkjenner gjeldende versjon.
 *
 * Retting uten lys og peis (FE-1, Dag 57): overskriften og hintet kommer fra
 * correctionKind (review-svaret), ikke fra tjenesten.
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
  // Valgt versjon i stripa («original» eller en variant); null gir gjeldende runde.
  const [variantId, setVariantId] = useState<string | null>(null);
  // FE-3: bryteren «Vis rått svar fra modellen (bare admin)» under bildet.
  const [rawShown, setRawShown] = useState(false);
  // Admin (view_all fra /me) ser rått. Feil eller manglende svar: ikke admin.
  const [caps, setCaps] = useState<Capabilities>(NO_CAPABILITIES);
  const [answer, setAnswer] = useState<FireplaceAnswer>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);
  // Handlingen som er sendt (TG-NEW-147: «Godkjenner …» paa knappen).
  const [pending, setPending] = useState<DecisionAction | null>(null);
  // Valgt lysstyrke; null gir default_step. Hovedbildet lastet: forhaandslast de andre trinnene.
  const [chosenStep, setChosenStep] = useState<BrightnessStep | null>(null);
  const [resultLoaded, setResultLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  // P3b: bekreftelsen etter «Ja, avbryt» i et stopp, fra svaret paa avgjoerelsen.
  const [stopDone, setStopDone] = useState<UiKey | null>(null);
  // «Korriger bildet» (2d-2b). Bryterne holdes paa key og nullstilles ved Avbryt.
  const [editing, setEditing] = useState(false);
  const [toggles, setToggles] = useState<Toggles>({});
  const [correctAnswer, setCorrectAnswer] = useState<FireplaceAnswer>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  // «Jeg har sammenlignet bildet med originalen.» (D-5a). Ved advarsel setter
  // samme kryss ogsaa acknowledged (TG-NEW-199). Gjelder bare runden siden viser.
  const [compared, setCompared] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  // Synkront vern mot dobbeltklikk; busy-state rekker ikke aa oppdatere
  // mellom to raske klikk. Backend har ogsaa eget vern.
  const inFlight = useRef(false);
  const [waking, setWaking] = useState(false);
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
      // Kaldstart (TG-NEW-134): getReview proever paa nytt, og lasteteksten blir rolig.
      result = await getReview({ jobId, getToken, onRetry: () => setWaking(true) });
    } catch {
      result = { kind: "error", httpStatus: 0 };
    }
    setWaking(false);
    setLoad(result);
    setPollJobId(null);
    // Etter en ny runde eller avgjoerelse vises gjeldende runde igjen,
    // og lysstyrken starter paa default_step (Petter 02.10, valg 4).
    setVariantId(null);
    setRawShown(false);
    setChosenStep(null);
    setResultLoaded(false);
    setCompared(false);
    setAcknowledged(false);
    setLightbox(false);
    // P3b: bekreftelsen gjelder bare svaret den kom fra (settes etter refetch, i handle).
    setStopDone(null);
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
  // TG-NEW-193: samme view_all-sjekk som «Detaljer».
  const admin = adminView(caps);

  const decide = (action: DecisionAction, brightnessStep: BrightnessStep | null) => {
    if (locked || load.kind !== "ok") return;
    const review = load.review;
    const fromStop = action === "reject" && isStopped(review);
    void runDecision({
      inFlight,
      send: () =>
        postDecision({
          jobId,
          decision: buildDecision(action, reasonText, answer, review, brightnessStep, acknowledged),
          getToken,
        }),
      // Etter 200 og 409 status_changed (ny versjon, TG-NEW-130).
      refetch: fetchReview,
      onStart: () => {
        setBusy(true);
        setPending(action);
        setMessage(null);
        setStopDone(null);
      },
      onError: () => setMessage({ key: "decision.error" }),
      onSettled: () => {
        setBusy(false);
        setPending(null);
      },
      handle: (out) => {
        switch (out.kind) {
          case "updated":
            setRejectOpen(false);
            setReasonText("");
            // «Ja, avbryt» i et stopp: gratisbildet bare naar svaret sier "returned".
            if (fromStop) setStopDone(stopDoneKey(out.quotaReturn));
            break;
          case "poll":
            setRejectOpen(false);
            setPollJobId(jobId);
            break;
          case "status_changed":
            setRejectOpen(false);
            setMessage({ key: "decision.statusChanged" });
            break;
          case "blocked": {
            // 409: ingen ny handling. 422 (ugyldig body, f.eks. begrunnelsen)
            // og trinn som ikke kan lages, kan rettes av megleren, saa
            // knappene blir staaende (blockedResult, TG-NEW-147).
            const result = blockedResult(out);
            if (result.refetch) void fetchReview();
            setMessage(result.message);
            if (result.block) setBlocked(true);
            break;
          }
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
        // FE-3: laget «Lager versjon n …» vises fra klikket (makingImage).
        setPending("correct");
        setMessage(null);
      },
      onError: () => setMessage({ key: "decision.error" }),
      onSettled: () => {
        setBusy(false);
        setPending(null);
      },
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
      <main className="max-w-[1360px] mx-auto w-full p-4 sm:p-8 flex-1 flex flex-col gap-6">
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
          {admin && <p className="text-ink-2 text-xs font-mono break-all">{jobId}</p>}
        </div>

        {load.kind === "loading" && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-4 border-line border-t-ink rounded-full animate-spin motion-reduce:animate-none" />
            <p className="text-ink-2 text-sm">
              {t(locale, waking ? "net.waking" : "review.loading")}
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
            // TG-NEW-268: «Bildetype: … (valgt ved bestilling)», bare naar megleren valgte typen.
            const typeLine = imageTypeLine(review);
            // P3b: grunnene naar vi ikke laget bildet, og gratisbildet ved "returned".
            // Rett etter «Ja, avbryt» staar bekreftelsen i stedet (den har gratisbildet med).
            const doneLines =
              stopDone !== null
                ? [stopDone]
                : failedLines({ ...review, imageType: review.imageType.value });
            // «Rått fra modellen» skjules naar lysstyrke finnes (TG-NEW-147, valg (a)).
            const variants = visibleVariants(
              compareVariants(review.images, { isAdmin: caps.viewAll }),
              review.brightness
            );
            const strip = versionStrip(review.images, variants);
            const entry = selectedEntry(strip, variantId);
            const originalShown = entry?.kind === "original";
            // FE-3: råbildet står ikke i stripa; bryteren viser det for valgt versjon (bare admin).
            const raw = rawCounterpart(variants, entry);
            const rawOn = rawShown && raw !== null;
            const shown = rawOn ? raw : entry?.kind === "variant" ? entry.variant : null;
            // «Godkjenn» er låst når råbildet vises, som før (backend godkjenner gjeldende versjon).
            const approveLock = approveLocked(strip, entry) || rawOn;
            // FE-3: fra klikket på «Lag nytt bilde» eller «Lag bildet» til nytt resultat eller feil.
            const making = makingImage(polling, pending) ? nextVersion(variants) : null;
            const brightness = brightnessView(review, shown);
            const step = brightness.kind === "control" ? selectedStep(brightness, chosenStep) : null;
            // Gjeldende runde med slideren: trinnets lenke fra backend, aldri et CSS-filter.
            const stepShown = brightness.kind === "control" && !brightness.locked ? step : null;
            // Gamle jobber uten rounds: lenken velges fra de merkede feltene som foer.
            // Runder: lenken som den er, null gir plassholder (ingen tilbakefall).
            // «Original» i stripa: originalen, bare i lysboksen (siden viser den uten resultat).
            const roundUrl = originalShown
              ? review.images.originalUrl
              : shown === null
                ? null
                : shown.source.kind === "legacy"
                  ? resultImageUrl(review.images, shown.source.variant)
                  : shown.source.url;
            const shownUrl = stepShown !== null ? brightnessResultUrl(review.brightness, stepShown) : roundUrl;
            const entryLabel =
              entry === null
                ? ""
                : rawOn
                  ? variantLabel(locale, raw, { choices: admin, presetId: review.presetId })
                  : stripLabel(locale, entry, { choices: admin, presetId: review.presetId });
            const shownLabel =
              stepShown !== null
                ? `${entryLabel} · ${t(locale, "brightness.altStep", { step: stepName(locale, stepShown) })}`
                : entryLabel;
            const correction = correctionControls(review);
            const canCorrect = correction.show && !limitReached && done === null;
            const isEditing = editing && canCorrect;
            // Panelene per oppskrift (G3): uten peispanelet ingen peisspoersmaal.
            const fireplaceShown = correctionFireplaceShown(review.fireplace) && panelShown(review, "fireplace");
            const kind = correctionKind(review, fireplaceShown);
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
            const deleted = mediaDeleted(review);
            const tabs = orderTabs(review.order, jobId, locale);

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

                {deleted && (
                  // TG-NEW-117: bildene i full stoerrelse er slettet; opplysningene er beholdt.
                  <p
                    className="text-sm text-neutral-fg bg-neutral-bg rounded-button p-3"
                    role="status"
                  >
                    {t(locale, "review.mediaDeleted", { date: formatDate(review.mediaDeletedAt ?? null, locale) })}
                  </p>
                )}

                {tabs !== null && <OrderTabs tabs={tabs} locale={locale} />}

                {/* Stort bilde til venstre, handlinger og stemning i en kolonne paa 22rem ved siden av. Paa mobil under hverandre. */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
                  <section className={`${CARD} flex flex-col gap-6 min-w-0`}>
                    {deleted ? (
                      // Ingen varianter, modusknapper eller lysstyrke: én boks (Petter 05.10, A1).
                      <PreviewPlaceholder reason="deleted" />
                    ) : (
                      <>
                        <VersionStrip
                          strip={strip}
                          selectedId={entry?.id ?? null}
                          onSelect={setVariantId}
                          choices={admin}
                          presetId={review.presetId}
                          making={making}
                          locale={locale}
                        />
                        {/* FE-3: laget dekker visningen mens en ny versjon lages; den er inert så lenge. */}
                        <div className="relative">
                          <div inert={making !== null}>
                            <CompareViewer
                              originalUrl={review.images.originalUrl}
                              result={shown === null ? null : { url: shownUrl, label: shownLabel }}
                              placeholder={<PreviewPlaceholder />}
                              onResultLoad={() => setResultLoaded(true)}
                              lightsView={
                                canShowMarkers(review, { litOnly: !admin }) && review.images.originalUrl !== null ? (
                                  <LightMarkers
                                    url={review.images.originalUrl}
                                    lights={review.lights}
                                    inputOrientation={review.inputOrientation}
                                    litOnly={!admin}
                                    locale={locale}
                                  />
                                ) : null
                              }
                              additionsView={
                                canShowAdditions(review) && review.images.previewUrl !== null ? (
                                  <AdditionMarkers
                                    url={review.images.previewUrl}
                                    items={review.additionsCheck.items}
                                    admin={admin}
                                    locale={locale}
                                  />
                                ) : null
                              }
                              onExpand={() => setLightbox(true)}
                              locale={locale}
                            />
                          </div>
                          {making !== null && <MakingOverlay version={making} locale={locale} />}
                        </div>
                        {raw !== null && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setRawShown(!rawOn)}
                              aria-pressed={rawOn}
                              className={choiceClass(rawOn, "rounded-pill")}
                            >
                              {t(locale, "compare.showRaw")}
                            </button>
                          </div>
                        )}
                        {brightness.kind === "control" && step !== null && (
                          <BrightnessControl
                            view={brightness}
                            step={step}
                            onChange={setChosenStep}
                            locked={locked}
                            preload={preloadUrls(brightness.steps, step)}
                            ready={resultLoaded}
                            locale={locale}
                          />
                        )}
                        {brightness.kind === "approved" && <BrightnessApproved step={brightness.step} locale={locale} />}
                        {lightbox && review.images.originalUrl !== null && (
                          <Lightbox
                            originalUrl={review.images.originalUrl}
                            aiUrl={shownUrl}
                            aiAlt={
                              originalShown
                                ? t(locale, "compare.altOriginal")
                                : t(locale, "compare.altResult", { label: shownLabel })
                            }
                            placeholder={<PreviewPlaceholder />}
                            rounds={
                              stripShown(strip, making) ? (
                                <VersionStrip
                                  strip={strip}
                                  selectedId={entry?.id ?? null}
                                  onSelect={setVariantId}
                                  choices={admin}
                                  presetId={review.presetId}
                                  making={making}
                                  locale={locale}
                                />
                              ) : null
                            }
                            originalOnly={originalShown}
                            onClose={() => setLightbox(false)}
                            locale={locale}
                          />
                        )}
                      </>
                    )}
                  </section>

                  <div className="flex flex-col gap-6 min-w-0">
                    {done !== null ? (
                      // Nedlasting og tekst til annonsen der resultatet vises (etter godkjenning).
                      <section className={CARD}>
                        <p className="text-ink font-bold">{t(locale, doneTitleKey(done.key, stopDone))}</p>
                        {done.reason && (
                          <p className="text-sm text-ink mt-2 break-words">
                            {t(locale, "review.reasonLabel")}: {done.reason}
                          </p>
                        )}
                        {doneLines.map((key) => (
                          <p key={key} className="text-sm text-ink mt-2">
                            {t(locale, key)}
                          </p>
                        ))}
                        {typeLine !== null && <p className="text-sm text-ink mt-2">{noteText(locale, typeLine)}</p>}
                        {canDownload(review) && <DownloadButton jobId={review.jobId} presetId={review.presetId} locale={locale} />}
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
                        // Porten (Dag 56, P3a): stoppboksen og merknadene for alle roller.
                        stop={
                          isStopped(review)
                            ? { reasons: stopReasons(review), fireplace: isFireplaceStop(review) }
                            : null
                        }
                        notes={reviewNotes(review)}
                        imageTypeLine={typeLine}
                        controls={controls}
                        canCorrect={canCorrect}
                        roundFailed={correction.roundFailed}
                        // Banneret sier det allerede: ingen «Ingen handlinger …» (C1).
                        readOnly={readOnly || deleted}
                        locked={locked}
                        busy={busy}
                        approving={isApproving(pending)}
                        polling={polling}
                        answer={answer}
                        onAnswer={setAnswer}
                        rejectOpen={rejectOpen}
                        onRejectOpen={setRejectOpen}
                        reasonText={reasonText}
                        onReasonText={setReasonText}
                        onDecide={(action) => decide(action, step)}
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
                              lightsShown={panelShown(review, "lights")}
                              kind={kind}
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
                              admin={admin}
                              locale={locale}
                            />
                          ) : null
                        }
                        additions={review.additionsCheck}
                        checklist={checklistFor(review.presetId)}
                        compared={compared}
                        onCompared={setCompared}
                        acknowledged={acknowledged}
                        onAcknowledged={setAcknowledged}
                        approveLock={approveLock}
                        framingPct={framingWarning(review.framing)}
                        message={messageText}
                        locale={locale}
                      />
                    )}

                    {/* TG-NEW-263: ønskene og svaret, for alle roller, under kortet med knappene. */}
                    {review.wishes !== null && (
                      <WishesPanel
                        wishes={review.wishes}
                        status={review.status}
                        isOwner={review.isOwner}
                        locale={locale}
                      />
                    )}

                    <MoodPanel review={review} admin={admin} locale={locale} />

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
