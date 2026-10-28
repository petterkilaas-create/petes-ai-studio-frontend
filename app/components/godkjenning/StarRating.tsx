"use client";

import { RATINGS, type FeedbackRating } from "../../lib/feedback";
import { t, type Locale } from "../../lib/i18n";
import { FOCUS } from "./classes";

// Stjernen (24x24); utenfor JSX, saa tekstsjekken ikke leser den som tekst.
const STAR_PATH = "M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.14l-5.62 2.96 1.07-6.27L2.9 9.4l6.3-.9z";

/**
 * 1–5 stjerner (Dag 58), paa godkjenningssiden og i Historikk. Hver stjerne
 * er en knapp paa minst 44 px (mobil), med «n av 5 stjerner» som navn;
 * stjernene til og med valgt er fylt. Uten `onChange` vises de bare.
 */
export function StarRating({
  value,
  onChange,
  disabled = false,
  labelledBy,
  locale,
}: {
  value: FeedbackRating | null;
  onChange?: (rating: FeedbackRating) => void;
  disabled?: boolean;
  /** id-en til overskriften gruppen hoerer til. */
  labelledBy?: string;
  locale: Locale;
}) {
  if (onChange === undefined) {
    return (
      <span
        role="img"
        aria-label={t(locale, "feedback.star", { n: value ?? 0 })}
        className="inline-flex items-center gap-0.5"
      >
        {RATINGS.map((n) => (
          <Star key={n} on={value !== null && n <= value} size="w-5 h-5" />
        ))}
      </span>
    );
  }
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy === undefined ? t(locale, "feedback.stars") : undefined}
      className="flex flex-wrap gap-1"
    >
      {RATINGS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          disabled={disabled}
          aria-pressed={value === n}
          aria-label={t(locale, "feedback.star", { n })}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-button disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
        >
          <Star on={value !== null && n <= value} size="w-8 h-8" />
        </button>
      ))}
    </div>
  );
}

function Star({ on, size }: { on: boolean; size: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${size} ${on ? "text-primary" : "text-line-strong"}`}
      fill={on ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d={STAR_PATH} />
    </svg>
  );
}
