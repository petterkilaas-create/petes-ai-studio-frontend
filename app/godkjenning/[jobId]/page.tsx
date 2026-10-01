"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  fetchJobDownload,
  getReview,
  postDecision,
  REASON_MAX_LEN,
  type DecisionAction,
  type ReviewFetchResult,
  type ReviewLight,
  type RunValue,
} from "../../lib/api";
import { useJobStatus } from "../../lib/useJobStatus";
import { codeText, t, type CodeGroup, type Locale, type UiKey } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";
import {
  buildDecision,
  decisionControls,
  FIREPLACE_OPTIONS,
  fireplaceAnswerKey,
  outcome,
  reasonLength,
  reasonTooLong,
  resultImageUrl,
  shouldPoll,
  variantOptions,
  type FireplaceAnswer,
  type ImageVariant,
} from "../../lib/review";
import { isReadOnlyOther } from "../../lib/roles";
import {
  buildCorrection,
  canSubmitCorrection,
  canToggle,
  correctionControls,
  correctionFireplaceShown,
  correctionResult,
  initialToggles,
  isOn,
  needsConfirmation,
  previousFireplaceAnswer,
  setToggle,
  type Toggles,
} from "../../lib/correction";
import { runDecision } from "../../lib/decide";
import { duskFacts, type ReviewDusk } from "../../lib/dusk";
import {
  DISCLOSURE_DETAIL,
  DISCLOSURE_LOCALE,
  disclosureText,
  type ReviewDisclosure,
} from "../../lib/disclosure";
import { copyText, type CopyResult } from "../../lib/clipboard";
import { canDownload, downloadMarkedImage } from "../../lib/download";
import { PreviewPlaceholder } from "../../components/PreviewPlaceholder";
import { buttonClass } from "../../components/ui/Button";
import { cardClass } from "../../components/ui/Card";

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
 */

type LoadState = { kind: "loading" } | ReviewFetchResult;

/** Melding etter en avgjoerelse: ui-tekst eller kode fra backend. */
type Message = { key: UiKey } | { group: CodeGroup; code: string | null };

const CARD = cardClass("md");
const LABEL = "text-sm font-medium text-ink-2 mb-4";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
const BTN_PRIMARY = buttonClass("primary");
const BTN_SECONDARY = buttonClass("secondary");
const VARIANT_LABEL: Record<ImageVariant, UiKey> = {
  lifted: "review.variantLifted",
  raw: "review.variantRaw",
  previous: "review.previousRound",
};
const BTN_DANGER = buttonClass("danger");

function ImageBox({
  url,
  alt,
  locale,
  preview = false,
}: {
  url: string | null;
  alt: string;
  locale: Locale;
  /** KI-bildet (merket forhaandsvisning): mangler det, vises plassholderen (L2). */
  preview?: boolean;
}) {
  if (!url && preview) return <PreviewPlaceholder />;
  if (!url) {
    return (
      <div className="aspect-[3/2] w-full rounded-button border border-dashed border-line-strong bg-surface-2 flex items-center justify-center text-ink-2 text-sm">
        {t(locale, "review.noImage")}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="w-full h-auto rounded-button border border-line" />
  );
}

/**
 * Peisspoersmaalet med Tent/Ikke tent (2d-2d). Brukes baade for «Send
 * videre» og i Rett-modus. Linja under knappene sier at «Ikke tent» slukker
 * ild i originalen; den staar utenfor knappene saa de holder seg korte paa mobil.
 */
function FireplaceChoice({
  answer,
  onChange,
  disabled,
  locale,
}: {
  answer: FireplaceAnswer;
  onChange: (answer: "yes" | "no") => void;
  disabled: boolean;
  locale: Locale;
}) {
  return (
    <div>
      <p className="text-sm text-ink font-bold mb-2">{t(locale, "action.fireplaceQuestion")}</p>
      <div className="flex gap-2" role="group">
        {FIREPLACE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            aria-pressed={answer === option.value}
            className={answer === option.value ? BTN_PRIMARY : BTN_SECONDARY}
          >
            {t(locale, option.key)}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-2 mt-2">{t(locale, "action.fireplaceNotLitHint")}</p>
    </div>
  );
}

/** Rett-modus for en liste: null naar brukeren ikke retter. */
interface LightEditing {
  toggles: Toggles;
  /** Ustabile og avviste er kandidater (promote); godkjente kan slaas av. */
  candidate: boolean;
  disabled: boolean;
  onToggle: (light: ReviewLight, on: boolean) => void;
}

function LightLabel({ light, locale }: { light: ReviewLight; locale: Locale }) {
  return (
    <>
      <span className="font-bold">{codeText(locale, "lightType", light.type)}</span>
      {/* location er fritekst fra analysen; React escaper den. */}
      {light.location && <span className="text-ink-2"> · {light.location}</span>}
      {light.reasonCode !== null && (
        <span className="text-ink-2">
          {" "}
          ({codeText(locale, "lightReason", light.reasonCode)})
        </span>
      )}
      {(light.state === "promoted" || light.state === "disabled") && (
        <span className="ml-2 inline-block px-2 py-0.5 rounded-pill bg-neutral-bg text-neutral-fg text-[13px] font-medium">
          {t(locale, light.state === "promoted" ? "review.lightPromoted" : "review.lightDisabled")}
        </span>
      )}
    </>
  );
}

function LightList({
  title,
  lights,
  locale,
  editing,
}: {
  title: string;
  lights: ReviewLight[];
  locale: Locale;
  editing: LightEditing | null;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-ink mb-2">
        {title} ({lights.length})
      </p>
      {lights.length === 0 ? (
        <p className="text-xs text-ink-2">{t(locale, "review.lightsEmpty")}</p>
      ) : (
        <ul className={`${editing ? "space-y-2" : "space-y-1"} text-xs text-ink`}>
          {lights.map((light, i) => {
            const rowKey = `${light.key ?? light.id ?? "x"}-${i}`;
            if (editing === null) {
              return (
                <li key={rowKey}>
                  <LightLabel light={light} locale={locale} />
                </li>
              );
            }
            const editable = canToggle(light, editing.candidate);
            const on = isOn(light, editing.toggles);
            // Ekte bryter (checkbox med role=switch) med hele raden som
            // etikett, minst 44 px hoey for tommel paa mobil.
            return (
              <li key={rowKey}>
                <label
                  className={`flex items-center gap-3 min-h-11 px-3 py-2 rounded-button border ${
                    editable ? "border-line-strong cursor-pointer" : "border-line opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    role="switch"
                    checked={on}
                    disabled={!editable || editing.disabled}
                    onChange={(e) => editing.onToggle(light, e.target.checked)}
                    className={`w-5 h-5 shrink-0 accent-primary ${FOCUS}`}
                  />
                  <span className="flex-1">
                    <LightLabel light={light} locale={locale} />
                  </span>
                  <span className="text-[13px] text-ink-2">
                    {editable
                      ? t(locale, on ? "correct.lightOn" : "correct.lightOff")
                      : t(locale, "correct.locked")}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RunValueLine({
  label,
  value,
  group,
  locale,
}: {
  label: string;
  value: RunValue;
  group: "imageType" | "skyVisibility";
  locale: Locale;
}) {
  const distinct = [...new Set(value.runValues)];
  return (
    <div>
      <p className="text-xs text-ink-2">{label}</p>
      <p className="text-sm text-ink">{codeText(locale, group, value.value)}</p>
      {distinct.length > 1 && (
        <p className="text-xs text-amber-fg">
          {t(locale, "review.runValues", {
            values: distinct.map((v) => codeText(locale, group, v)).join(" / "),
          })}
        </p>
      )}
    </div>
  );
}

/**
 * Skumringsvalgene (2f-b, valg A): egen undertittel, saa de ikke blandes med
 * analysens himmel-linje. Himmelen vises ikke som valg naar den ikke ble
 * brukt (sky_applied false). Uten dusk fra backend vises ingenting.
 */
function DuskFactsBlock({ dusk, locale }: { dusk: ReviewDusk | null; locale: Locale }) {
  const facts = duskFacts(dusk);
  if (facts === null) return null;
  return (
    <div>
      <p className={LABEL}>{t(locale, "review.duskTitle")}</p>
      <p className="text-xs text-ink-2">{t(locale, "dusk.time")}</p>
      <p className="text-sm text-ink mb-2">{codeText(locale, "duskTime", facts.time)}</p>
      <p className="text-xs text-ink-2">{t(locale, "dusk.sky")}</p>
      <p className="text-sm text-ink">
        {facts.sky.kind === "not_applied"
          ? t(locale, "review.duskSkyNotApplied")
          : codeText(locale, "duskSky", facts.sky.code)}
      </p>
    </div>
  );
}

/**
 * «Last ned merket bilde» (merking PR 4) i done-kortet. Vises bare for
 * eieren (canDownload); backend avviser admin paa andres jobb. Ved feil vises
 * en kort melding ut fra koden, aldri raa tekst.
 */
function DownloadButton({ jobId, locale }: { jobId: string; locale: Locale }) {
  const { getToken } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<UiKey | null>(null);
  // Synkront vern mot dobbeltklikk, som inFlight paa siden.
  const inFlight = useRef(false);

  const onDownload = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDownloading(true);
    setError(null);
    try {
      const result = await downloadMarkedImage({
        jobId,
        fetchFile: () => fetchJobDownload({ jobId, getToken }),
      });
      if (result.kind === "error") setError(result.key);
    } finally {
      inFlight.current = false;
      setDownloading(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-2 items-start">
      <button onClick={onDownload} disabled={downloading} className={BTN_PRIMARY}>
        {t(locale, downloading ? "review.downloading" : "review.download")}
      </button>
      <span className="text-xs text-amber-fg" role="status">
        {error ? t(locale, error) : ""}
      </span>
    </div>
  );
}

/**
 * «Tekst til annonsen» (merking PR 2) i done-kortet for godkjente jobber.
 * Teksten er alltid norsk (annonsens spraak) inntil TG-NEW-129; overskrift
 * og knapper foelger nettleseren. Kopiering endrer ingenting i backend, saa
 * admin paa andres jobb ser og kan kopiere det samme.
 */
function DisclosureBlock({ disclosure, locale }: { disclosure: ReviewDisclosure | null; locale: Locale }) {
  const [copy, setCopy] = useState<CopyResult | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const result = disclosureText(DISCLOSURE_LOCALE, disclosure, DISCLOSURE_DETAIL);
  if (result === null) return null;

  const onCopy = async (text: string) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    const outcome = await copyText(text);
    setCopy(outcome);
    if (outcome === "copied") {
      resetTimer.current = setTimeout(() => setCopy(null), 2000);
    } else {
      // Reserve: marker teksten, saa megleren kan trykke Cmd+C.
      boxRef.current?.focus();
      boxRef.current?.select();
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-3">
      <p className={`${LABEL} mb-0`}>{t(locale, "review.disclosureTitle")}</p>
      {result.kind === "missing" ? (
        <p
          className="text-sm text-amber-fg bg-amber-bg rounded-button p-3"
          role="status"
        >
          {t(locale, "review.disclosureMissing")}
        </p>
      ) : (
        <>
          <textarea
            ref={boxRef}
            readOnly
            value={result.text}
            rows={3}
            lang={DISCLOSURE_LOCALE}
            aria-label={t(locale, "review.disclosureTitle")}
            className={`w-full resize-none bg-surface border border-ink-2 rounded-button p-3 text-sm text-ink ${FOCUS}`}
          />
          <p className="text-xs text-ink-2">{t(locale, "review.disclosureHelp")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => onCopy(result.text)} className={BTN_SECONDARY}>
              {t(locale, copy === "copied" ? "review.copied" : "action.copy")}
            </button>
            <span className="text-xs text-amber-fg" role="status">
              {copy === "failed" ? t(locale, "review.copyFailed") : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function GodkjenningPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const { getToken } = useAuth();
  const locale = useLocale();

  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [variant, setVariant] = useState<ImageVariant>("lifted");
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
  }, [jobId, getToken]);

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
            const options = variantOptions(review.images);
            const shownVariant: ImageVariant = options.includes(variant) ? variant : "lifted";
            const tooLong = reasonTooLong(reasonText);
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
            const lightEditing = (candidate: boolean): LightEditing | null =>
              isEditing
                ? {
                    toggles,
                    candidate,
                    disabled: locked,
                    onToggle: (light, on) => setToggles((prev) => setToggle(prev, light, candidate, on)),
                  }
                : null;

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

                {/* Original og resultat: side om side paa skjerm, under hverandre paa mobil. */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className={CARD}>
                    <p className={LABEL}>{t(locale, "review.original")}</p>
                    <ImageBox
                      url={review.images.originalUrl}
                      alt={t(locale, "review.original")}
                      locale={locale}
                    />
                  </div>
                  <div className={CARD}>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <p className={`${LABEL} mb-0`}>{t(locale, "review.result")}</p>
                      {options.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1" role="group">
                          {options.map((v) => (
                            <button
                              key={v}
                              onClick={() => setVariant(v)}
                              aria-pressed={shownVariant === v}
                              className={`min-h-11 px-4 rounded-pill text-sm border transition-colors ${FOCUS} ${
                                shownVariant === v
                                  ? "bg-primary border-primary text-on-primary font-medium"
                                  : "bg-surface border-line-strong text-ink-2 hover:text-ink hover:bg-surface-2"
                              }`}
                            >
                              {t(locale, VARIANT_LABEL[v])}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <ImageBox
                      url={resultImageUrl(review.images, shownVariant)}
                      alt={t(locale, shownVariant === "previous" ? "review.previousRound" : "review.result")}
                      locale={locale}
                      preview
                    />
                  </div>
                </section>

                {done !== null && (
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
                  </section>
                )}

                {done === null && (
                  <section className={`${CARD} flex flex-col gap-4`}>
                    {correction.roundFailed && (
                      <p
                        className="text-sm text-amber-fg bg-amber-bg rounded-button p-3"
                        role="status"
                      >
                        {t(locale, "correct.roundFailed")}
                      </p>
                    )}

                    {isEditing ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-sm text-ink font-bold">{t(locale, "correct.title")}</p>
                        <p className="text-xs text-ink-2">{t(locale, "correct.hint")}</p>
                        <div>
                          <button onClick={cancelCorrection} disabled={locked} className={BTN_SECONDARY}>
                            {t(locale, "action.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {controls.fireplaceQuestion && (
                          <FireplaceChoice
                            answer={answer}
                            onChange={setAnswer}
                            disabled={locked}
                            locale={locale}
                          />
                        )}

                        {controls.none ? (
                          // Linja om bare lesing sier det samme lenger opp.
                          !readOnly && (
                            <p className="text-sm text-ink-2">{t(locale, "action.noneAllowed")}</p>
                          )
                        ) : (
                          <div className="flex flex-wrap gap-3">
                            {controls.approve && (
                              <button
                                onClick={() => void decide("approve")}
                                disabled={locked}
                                className={BTN_PRIMARY}
                              >
                                {t(locale, "action.approve")}
                              </button>
                            )}
                            {controls.continue && (
                              <button
                                onClick={() => void decide("continue")}
                                disabled={locked || !controls.continueEnabled}
                                className={BTN_PRIMARY}
                              >
                                {t(locale, "action.continue")}
                              </button>
                            )}
                            {canCorrect && (
                              <button onClick={startCorrection} disabled={locked} className={BTN_SECONDARY}>
                                {t(locale, "action.correct")}
                              </button>
                            )}
                            {controls.reject && !rejectOpen && (
                              <button
                                onClick={() => setRejectOpen(true)}
                                disabled={locked}
                                className={BTN_DANGER}
                              >
                                {t(locale, "action.reject")}
                              </button>
                            )}
                          </div>
                        )}

                        {controls.continue && (
                          <p className="text-xs text-ink-2">{t(locale, "action.newImage")}</p>
                        )}

                        {controls.reject && rejectOpen && (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={reasonText}
                              onChange={(e) => setReasonText(e.target.value)}
                              placeholder={t(locale, "action.reasonPlaceholder")}
                              aria-label={t(locale, "action.reasonPlaceholder")}
                              rows={3}
                              disabled={locked}
                              className={`w-full bg-surface border border-ink-2 rounded-button p-3 text-sm text-ink ${FOCUS}`}
                            />
                            <p className={`text-xs ${tooLong ? "text-red-fg" : "text-ink-2"}`}>
                              {tooLong
                                ? t(locale, "action.reasonTooLong", { max: REASON_MAX_LEN })
                                : t(locale, "action.reasonCount", {
                                    n: reasonLength(reasonText),
                                    max: REASON_MAX_LEN,
                                  })}
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={() => void decide("reject")}
                                disabled={locked || tooLong}
                                className={BTN_DANGER}
                              >
                                {t(locale, "action.confirmReject")}
                              </button>
                              <button
                                onClick={() => setRejectOpen(false)}
                                disabled={locked}
                                className={BTN_SECONDARY}
                              >
                                {t(locale, "action.cancel")}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {(busy || polling) && (
                      <p className="text-xs text-ink-2" role="status">
                        {polling
                          ? t(locale, "review.statusRunning")
                          : t(locale, "action.working")}
                      </p>
                    )}
                  </section>
                )}

                {messageText !== null && !isEditing && (
                  <p
                    className="text-sm text-amber-fg bg-amber-bg rounded-button p-3"
                    role="status"
                  >
                    {messageText}
                  </p>
                )}

                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className={`${CARD} flex flex-col gap-4`}>
                    {(review.code !== null || review.reasonCodes.length > 0) && (
                      <div>
                        <p className={LABEL}>{t(locale, "review.reasons")}</p>
                        {review.code !== null && (
                          <p className="text-sm text-ink mb-2">
                            {codeText(locale, "reviewCode", review.code)}
                          </p>
                        )}
                        <ul className="list-disc pl-5 space-y-1 text-sm text-ink">
                          {review.reasonCodes.map((c, i) => (
                            <li key={`${c}-${i}`}>{codeText(locale, "reasonCode", c)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {review.flagCodes.length > 0 && (
                      <div>
                        <p className={LABEL}>{t(locale, "review.notes")}</p>
                        <ul className="list-disc pl-5 space-y-1 text-sm text-ink">
                          {review.flagCodes.map((c, i) => (
                            <li key={`${c}-${i}`}>{codeText(locale, "flagCode", c)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <DuskFactsBlock dusk={review.dusk} locale={locale} />
                    {/* Analysen har egen undertittel, saa «Valgt stemning» bare gjelder valgene. */}
                    <div className="flex flex-col gap-4">
                      <p className={`${LABEL} mb-0`}>{t(locale, "review.analysisTitle")}</p>
                      <RunValueLine
                        label={t(locale, "review.imageType")}
                        value={review.imageType}
                        group="imageType"
                        locale={locale}
                      />
                      <RunValueLine
                        label={t(locale, "review.sky")}
                        value={review.skyVisibility}
                        group="skyVisibility"
                        locale={locale}
                      />
                      <div>
                        <p className="text-xs text-ink-2">{t(locale, "review.fireplace")}</p>
                        <p className="text-sm text-ink">
                          {review.fireplace.disagreement
                            ? t(locale, "review.fireplaceDisagreement")
                            : review.fireplace.present
                              ? t(locale, "review.fireplacePresent")
                              : t(locale, "review.fireplaceNone")}
                        </p>
                        {(review.fireplace.answer === "yes" || review.fireplace.answer === "no") && (
                          <p className="text-xs text-ink-2">
                            {t(locale, "review.fireplaceAnswered", {
                              answer: t(locale, fireplaceAnswerKey(review.fireplace.answer)),
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={`${CARD} flex flex-col gap-4`}>
                    <p className={`${LABEL} mb-0`}>{t(locale, "review.lights")}</p>
                    {review.validRuns === 0 && (
                      <p className="text-xs text-amber-fg">{t(locale, "review.noValidRuns")}</p>
                    )}
                    <LightList
                      title={t(locale, "review.lightsApproved")}
                      lights={review.lights.approved}
                      locale={locale}
                      editing={lightEditing(false)}
                    />
                    <LightList
                      title={t(locale, "review.lightsUnstable")}
                      lights={review.lights.unstable}
                      locale={locale}
                      editing={lightEditing(true)}
                    />
                    <LightList
                      title={t(locale, "review.lightsRejected")}
                      lights={review.lights.rejected}
                      locale={locale}
                      editing={lightEditing(true)}
                    />

                    {isEditing && (
                      <div className="flex flex-col gap-4 border-t border-line pt-4">
                        {fireplaceShown && (
                          <FireplaceChoice
                            answer={correctAnswer}
                            onChange={setCorrectAnswer}
                            disabled={locked}
                            locale={locale}
                          />
                        )}

                        {confirmNeeded && (
                          <label className="flex items-start gap-3 min-h-11 cursor-pointer text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={confirmed}
                              disabled={locked}
                              onChange={(e) => setConfirmed(e.target.checked)}
                              className={`w-5 h-5 mt-0.5 shrink-0 accent-primary ${FOCUS}`}
                            />
                            <span>{t(locale, "correct.confirmExists")}</span>
                          </label>
                        )}

                        <p className="text-xs text-ink-2">
                          {t(locale, "correct.roundsLeft", { n: correction.roundsLeft })}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={() => void submitCorrection()}
                            disabled={locked || !submitEnabled}
                            className={BTN_PRIMARY}
                          >
                            {t(locale, "action.makeNewImage")}
                          </button>
                          <button onClick={cancelCorrection} disabled={locked} className={BTN_SECONDARY}>
                            {t(locale, "action.cancel")}
                          </button>
                        </div>
                        <p className="text-xs text-ink-2">{t(locale, "correct.newImageFromOriginal")}</p>
                        {messageText !== null && (
                          <p
                            className="text-sm text-amber-fg bg-amber-bg rounded-button p-3"
                            role="status"
                          >
                            {messageText}
                          </p>
                        )}
                        {busy && (
                          <p className="text-xs text-ink-2" role="status">
                            {t(locale, "action.working")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </>
            );
          })()}
      </main>
    </div>
  );
}
