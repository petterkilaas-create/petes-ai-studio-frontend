"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  getReview,
  postDecision,
  REASON_MAX_LEN,
  type DecisionAction,
  type ReviewFetchResult,
  type ReviewLight,
  type RunValue,
} from "../../lib/api";
import { useJobStatus } from "../../lib/useJobStatus";
import { codeText, t, type Locale, type UiKey } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";
import {
  buildDecision,
  decisionControls,
  hasVariantToggle,
  outcome,
  reasonLength,
  reasonTooLong,
  resultImageUrl,
  shouldPoll,
  type FireplaceAnswer,
  type ImageVariant,
} from "../../lib/review";

/**
 * Godkjenningssiden (2d-1): megleren avgjoer egne jobber i «Til kontroll»
 * (awaiting_approval) og «Til gjennomgang» (needs_review).
 *
 * Tilgang sjekkes i backend (fremmed eller ukjent jobb gir 404). Knappene
 * styres av `allowed_actions`; all tekst og alle koder gaar via ordlista.
 * Ingen pris vises, fordi eksterne kunder skal bruke siden.
 */

type LoadState = { kind: "loading" } | ReviewFetchResult;

/** Melding etter en avgjoerelse: ui-tekst eller kode fra backend. */
type Message = { key: UiKey } | { code: string | null };

const CARD = "bg-[#0f172a] border border-slate-800 rounded-3xl p-6";
const LABEL = "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4";
const FOCUS =
  "focus:outline-none focus:ring-2 focus:ring-[#009183] focus:ring-offset-2 focus:ring-offset-[#0B1120]";
const BTN_PRIMARY = `px-6 py-3 bg-[#009183] hover:bg-[#00b09f] text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_SECONDARY = `px-6 py-3 bg-transparent border border-slate-700 text-slate-300 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_DANGER = `px-6 py-3 bg-transparent border border-red-500/40 text-red-300 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;

function ImageBox({ url, alt, locale }: { url: string | null; alt: string; locale: Locale }) {
  if (!url) {
    return (
      <div className="aspect-[3/2] w-full rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-sm">
        {t(locale, "review.noImage")}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="w-full h-auto rounded-xl border border-slate-800" />
  );
}

function LightList({
  title,
  lights,
  locale,
}: {
  title: string;
  lights: ReviewLight[];
  locale: Locale;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-300 mb-2">
        {title} ({lights.length})
      </p>
      {lights.length === 0 ? (
        <p className="text-xs text-slate-500">{t(locale, "review.lightsEmpty")}</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-300">
          {lights.map((light, i) => (
            <li key={`${light.id ?? "x"}-${i}`}>
              <span className="font-bold">{codeText(locale, "lightType", light.type)}</span>
              {/* location er fritekst fra analysen; React escaper den. */}
              {light.location && <span className="text-slate-400"> · {light.location}</span>}
              {light.reasonCode !== null && (
                <span className="text-slate-500">
                  {" "}
                  ({codeText(locale, "lightReason", light.reasonCode)})
                </span>
              )}
            </li>
          ))}
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
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-white">{codeText(locale, group, value.value)}</p>
      {distinct.length > 1 && (
        <p className="text-xs text-amber-300">
          {t(locale, "review.runValues", {
            values: distinct.map((v) => codeText(locale, group, v)).join(" / "),
          })}
        </p>
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
    void fetchReview();
  }, [fetchReview]);

  // Ender pollingen uten at review er endret (f.eks. ukjent status), poller
  // vi ikke paa nytt: activePollId er den samme, saa useJobStatus starter ikke igjen.
  const pollDone = activePollId !== null && job.status !== "idle" && job.status !== "pending";
  useEffect(() => {
    if (pollDone) void fetchReview();
  }, [pollDone, fetchReview]);

  const retry = () => {
    setLoad({ kind: "loading" });
    void fetchReview();
  };

  const polling = activePollId !== null && !pollDone;
  const locked = busy || blocked || polling;

  const decide = async (action: DecisionAction) => {
    if (locked) return;
    setBusy(true);
    setMessage(null);
    try {
      const out = await postDecision({
        jobId,
        decision: buildDecision(action, reasonText, answer),
        getToken,
      });
      switch (out.kind) {
        case "updated":
          setRejectOpen(false);
          setReasonText("");
          await fetchReview();
          break;
        case "poll":
          setRejectOpen(false);
          setPollJobId(jobId);
          break;
        case "status_changed":
          setRejectOpen(false);
          setMessage({ key: "decision.statusChanged" });
          await fetchReview();
          break;
        case "blocked":
          setMessage({ code: out.code });
          // 409: ingen ny handling. 422 (ugyldig body, f.eks. begrunnelsen)
          // kan rettes av megleren, saa knappene blir staaende.
          if (out.code !== "invalid_decision") setBlocked(true);
          break;
        case "not_found":
          setLoad({ kind: "not_found" });
          break;
        case "error":
          setMessage({ key: "decision.error" });
          break;
      }
    } catch {
      setMessage({ key: "decision.error" });
    } finally {
      setBusy(false);
    }
  };

  const messageText =
    message === null
      ? null
      : "key" in message
        ? t(locale, message.key)
        : codeText(locale, "decisionError", message.code);

  return (
    <div className="flex flex-col bg-[#0B1120] text-white min-h-screen font-sans">
      <main className="max-w-6xl mx-auto w-full p-4 sm:p-8 flex-1 flex flex-col gap-6">
        <div>
          <Link
            href="/history"
            className={`text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white ${FOCUS}`}
          >
            ← {t(locale, "review.back")}
          </Link>
          <h1 className="text-3xl font-black text-white uppercase tracking-widest mt-4 mb-1">
            {t(locale, "review.title")}
          </h1>
          <p className="text-slate-500 text-xs font-mono break-all">{jobId}</p>
        </div>

        {load.kind === "loading" && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-4 border-[#009183]/30 border-t-[#009183] rounded-full animate-spin motion-reduce:animate-none" />
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              {t(locale, "review.loading")}
            </p>
          </div>
        )}

        {load.kind === "not_found" && (
          <div className={`${CARD} text-center max-w-lg mx-auto`}>
            <p className="text-white font-bold text-lg mb-2">{t(locale, "review.notFound")}</p>
            <p className="text-slate-400 text-sm">{t(locale, "review.notFoundHint")}</p>
          </div>
        )}

        {(load.kind === "unavailable" || load.kind === "error") && (
          <div className={`${CARD} text-center max-w-lg mx-auto`}>
            <p className="text-slate-300 text-sm mb-6">
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
            const showToggle = hasVariantToggle(review.images);
            const shownVariant: ImageVariant = showToggle ? variant : "lifted";
            const tooLong = reasonTooLong(reasonText);

            return (
              <>
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
                      {showToggle && (
                        <div className="flex gap-1" role="group">
                          {(["lifted", "raw"] as const).map((v) => (
                            <button
                              key={v}
                              onClick={() => setVariant(v)}
                              aria-pressed={shownVariant === v}
                              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${FOCUS} ${
                                shownVariant === v
                                  ? "bg-[#009183] border-[#009183] text-white"
                                  : "border-slate-700 text-slate-400 hover:text-white"
                              }`}
                            >
                              {t(locale, v === "lifted" ? "review.variantLifted" : "review.variantRaw")}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <ImageBox
                      url={resultImageUrl(review.images, shownVariant)}
                      alt={t(locale, "review.result")}
                      locale={locale}
                    />
                  </div>
                </section>

                {done !== null && (
                  <section className={CARD}>
                    <p className="text-white font-bold">{t(locale, done.key)}</p>
                    {done.reason && (
                      <p className="text-sm text-slate-300 mt-2 break-words">
                        {t(locale, "review.reasonLabel")}: {done.reason}
                      </p>
                    )}
                  </section>
                )}

                {done === null && (
                  <section className={`${CARD} flex flex-col gap-4`}>
                    {controls.fireplaceQuestion && (
                      <div>
                        <p className="text-sm text-white font-bold mb-2">
                          {t(locale, "action.fireplaceQuestion")}
                        </p>
                        <div className="flex gap-2" role="group">
                          {(["yes", "no"] as const).map((a) => (
                            <button
                              key={a}
                              onClick={() => setAnswer(a)}
                              disabled={locked}
                              aria-pressed={answer === a}
                              className={answer === a ? BTN_PRIMARY : BTN_SECONDARY}
                            >
                              {t(locale, a === "yes" ? "action.yes" : "action.no")}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {controls.none ? (
                      <p className="text-sm text-slate-400">{t(locale, "action.noneAllowed")}</p>
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
                      <p className="text-xs text-slate-400">{t(locale, "action.newImage")}</p>
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
                          className={`w-full bg-[#0B1120] border border-slate-700 rounded-xl p-3 text-sm text-white ${FOCUS}`}
                        />
                        <p className={`text-xs ${tooLong ? "text-red-400" : "text-slate-500"}`}>
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

                    {(busy || polling) && (
                      <p className="text-xs text-slate-400" role="status">
                        {polling
                          ? t(locale, "review.statusRunning")
                          : t(locale, "action.working")}
                      </p>
                    )}
                  </section>
                )}

                {messageText !== null && (
                  <p
                    className="text-sm text-amber-300 bg-amber-900/20 border border-amber-500/20 rounded-xl p-3"
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
                          <p className="text-sm text-white mb-2">
                            {codeText(locale, "reviewCode", review.code)}
                          </p>
                        )}
                        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                          {review.reasonCodes.map((c, i) => (
                            <li key={`${c}-${i}`}>{codeText(locale, "reasonCode", c)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {review.flagCodes.length > 0 && (
                      <div>
                        <p className={LABEL}>{t(locale, "review.notes")}</p>
                        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                          {review.flagCodes.map((c, i) => (
                            <li key={`${c}-${i}`}>{codeText(locale, "flagCode", c)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
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
                      <p className="text-xs text-slate-400">{t(locale, "review.fireplace")}</p>
                      <p className="text-sm text-white">
                        {review.fireplace.disagreement
                          ? t(locale, "review.fireplaceDisagreement")
                          : review.fireplace.present
                            ? t(locale, "review.fireplacePresent")
                            : t(locale, "review.fireplaceNone")}
                      </p>
                      {(review.fireplace.answer === "yes" || review.fireplace.answer === "no") && (
                        <p className="text-xs text-slate-400">
                          {t(locale, "review.fireplaceAnswered", {
                            answer: t(locale, review.fireplace.answer === "yes" ? "action.yes" : "action.no"),
                          })}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className={`${CARD} flex flex-col gap-4`}>
                    <p className={`${LABEL} mb-0`}>{t(locale, "review.lights")}</p>
                    {review.validRuns === 0 && (
                      <p className="text-xs text-amber-300">{t(locale, "review.noValidRuns")}</p>
                    )}
                    <LightList
                      title={t(locale, "review.lightsApproved")}
                      lights={review.lights.approved}
                      locale={locale}
                    />
                    <LightList
                      title={t(locale, "review.lightsUnstable")}
                      lights={review.lights.unstable}
                      locale={locale}
                    />
                    <LightList
                      title={t(locale, "review.lightsRejected")}
                      lights={review.lights.rejected}
                      locale={locale}
                    />
                  </div>
                </section>
              </>
            );
          })()}
      </main>
    </div>
  );
}
