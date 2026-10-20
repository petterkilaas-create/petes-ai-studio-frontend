"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { FOCUS } from "./classes";

/**
 * En video paa markedssiden (F1, TG-NEW-230). Videoen fyller boksen til
 * forelderen, som setter forholdet (CLS). Ingen video lastes foer den spilles
 * (preload="none"); til da vises plakaten.
 *
 * - `loop`: stum loekke uten kontroller. Den spilles med play() bare naar den
 *   er i synsfeltet og brukeren ikke har bedt om redusert bevegelse, og
 *   pauses utenfor synsfeltet. En liten knapp nede til hoeyre (unna AI-merket
 *   nede til venstre i bildene) pauser og spiller av (WCAG 2.2.2). Har
 *   brukeren valgt pause, starter loekka ikke igjen av seg selv. Med redusert
 *   bevegelse vises bare plakaten, og knappen sier «Spill av».
 * - `film`: nettleserens egne kontroller, ingen autoavspilling og ingen egen knapp.
 *
 * Komponenten brukes ikke paa noen side i F1 (F2-F4 tar den i bruk).
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const reducedMotionNow = () => window.matchMedia(REDUCED_MOTION).matches;
/** Paa serveren vet vi ikke innstillingen: vis plakaten til nettleseren svarer. */
const reducedMotionOnServer = () => true;

const BUTTON = `absolute bottom-3 right-3 flex size-11 items-center justify-center rounded-full bg-ink/75 text-surface ${FOCUS}`;

export function MarketingVideo({
  src,
  poster,
  label,
  mode,
  labels,
  describedBy,
}: {
  src: string;
  /** URL til plakaten: IMAGES[VIDEOS[key].poster].src. */
  poster: string;
  /** aria-label paa videoen (VideoRef.label). */
  label: string;
  mode: "loop" | "film";
  /** site.video. */
  labels: { play: string; pause: string };
  /** id-ene til tekstversjonen av filmen (aria-describedby, WCAG 1.2.1; F2). */
  describedBy?: string;
}) {
  if (mode === "film") {
    return (
      <video
        src={src}
        poster={poster}
        aria-label={label}
        aria-describedby={describedBy}
        controls
        playsInline
        preload="none"
        className="h-full w-full object-cover"
      />
    );
  }
  return <LoopVideo src={src} poster={poster} label={label} labels={labels} />;
}

function LoopVideo({
  src,
  poster,
  label,
  labels,
}: {
  src: string;
  poster: string;
  label: string;
  labels: { play: string; pause: string };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, reducedMotionOnServer);
  // "auto" foelger innstillingen for bevegelse; knappen gjoer valget til brukerens.
  const [choice, setChoice] = useState<"auto" | "play" | "pause">("auto");
  const running = choice === "play" || (choice === "auto" && !reducedMotion);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!running) {
      video.pause();
      return;
    }
    // Stum foer play(), ellers kan nettleseren nekte avspilling uten klikk.
    video.muted = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [running]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        aria-label={label}
        muted
        loop
        playsInline
        preload="none"
        className="h-full w-full object-cover"
      />
      <button
        type="button"
        aria-label={running ? labels.pause : labels.play}
        onClick={() => setChoice(running ? "pause" : "play")}
        className={BUTTON}
      >
        {running ? <Pause aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
      </button>
    </div>
  );
}
