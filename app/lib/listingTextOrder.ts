import { codeText, t, type Locale } from "./i18n/index.ts";
import {
  countChars,
  ListingTextError,
  listingTextErrorCode,
  NOTE_MAX_CHARS,
  RUN_STEPS,
  type ListingText,
  type RunStep,
} from "./listingText.ts";

/**
 * Bestillingssiden for annonseteksten (TG-NEW-281, T2): hvilken del siden
 * viser, om «Bestill tekstpakke» er aktiv, trinnlista og teksten for
 * feilkodene (kontrakten §3, §7 og §9). Ren modul uten React.
 */

/** Hentingen mens pakken behandles (K §0: hvert 3.-5. sekund). */
export const LISTING_TEXT_POLL_MS = 4_000;

/** Taket for hentingen: backend gir `stale` etter 900 s uten oppdatering. */
export const LISTING_TEXT_POLL_MAX_MS = 15 * 60_000;

/**
 * Delen av siden:
 * - `order`: bestillingen (`not_ordered`, eller `failed` uten versjon);
 * - `processing`: «Behandles» med trinnlista;
 * - `ready`: tekstpakken finnes (vises i T3);
 * - `deleted`: slettet etter lagringstiden;
 * - `unknown`: ukjent status fra backend.
 */
export type ListingTextView = "order" | "processing" | "ready" | "deleted" | "unknown";

export function listingTextView(pkg: ListingText): ListingTextView {
  if (pkg.mediaDeletedAt !== null) return "deleted";
  switch (pkg.displayStatus) {
    case "not_ordered":
      return "order";
    case "processing":
      return "processing";
    case "to_review":
    case "approved":
      return "ready";
    case "failed":
      return pkg.version === null ? "order" : "ready";
    default:
      return "unknown";
  }
}

/** Koden fra den siste kjoeringen naar bestillingen feilet uten versjon (ordlista `listingTextRunError`). */
export function failedRunCode(pkg: ListingText): string | null {
  if (pkg.displayStatus !== "failed" || pkg.version !== null) return null;
  return pkg.lastRun?.errorCode ?? "";
}

export type StepState = "done" | "current" | "todo";

/** Trinnene i rekkefoelge med tilstanden sin. Uten trinn (i koe) er alle `todo`. */
export function stepStates(step: RunStep | null): { step: RunStep; state: StepState }[] {
  const at = step === null ? -1 : RUN_STEPS.indexOf(step);
  return RUN_STEPS.map((s, i) => ({ step: s, state: i < at ? "done" : i === at ? "current" : "todo" }));
}

/** Hvorfor «Bestill tekstpakke» er graa, eller null naar den er aktiv. */
export type OrderBlock = "uploading" | "no_material" | "note_too_long" | "sending";

/**
 * Aktiv naar det finnes minst ett bilde, et dokument som er `ready` eller et
 * notat (ellers `no_material`, K §3). Graa mens et dokument lastes opp.
 */
export function orderBlock(input: {
  images: number;
  readyDocuments: number;
  note: string;
  uploading: boolean;
  sending: boolean;
}): OrderBlock | null {
  if (input.sending) return "sending";
  if (input.uploading) return "uploading";
  if (countChars(input.note) > NOTE_MAX_CHARS) return "note_too_long";
  if (input.images === 0 && input.readyDocuments === 0 && input.note.trim().length === 0) return "no_material";
  return null;
}

/** Klokkeslettet i teksten for dagsgrensen: «14.05» paa norsk, «14:05» paa engelsk. */
export function clockText(locale: Locale, at: Date): string {
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return locale === "nb" ? `${hh}.${mm}` : `${hh}:${mm}`;
}

/**
 * Teksten for en feilet bestilling. `429` (grensen per bruker og taket for
 * alle) faar tidspunktet fra `Retry-After` naar det finnes; alt annet kommer
 * fra ordlista (`listingTextError`).
 */
export function orderErrorText(locale: Locale, err: unknown, now: Date = new Date()): string {
  const code = listingTextErrorCode(err);
  const retryAfter = err instanceof ListingTextError ? err.retryAfter : null;
  if (retryAfter !== null && (code === "listing_text_daily_limit" || code === "listing_text_daily_cap")) {
    const time = clockText(locale, new Date(now.getTime() + retryAfter * 1000));
    const key = code === "listing_text_daily_limit" ? "listingText.order.limitAt" : "listingText.order.capAt";
    return t(locale, key, { time });
  }
  return codeText(locale, "listingTextError", code);
}

/** Etter disse feilene hentes pakken paa nytt (en kjoering paagaar, eller dokumentene er endret). */
export function refetchAfter(err: unknown): boolean {
  const code = listingTextErrorCode(err);
  return code === "listing_text_busy" || code === "document_not_ready" || code === "listing_text_exists";
}
