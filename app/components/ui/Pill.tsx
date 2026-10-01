import type { ReactNode } from "react";

/**
 * Statuspille (D1, brief §8): amber = til godkjenning / venter, green =
 * godkjent / ferdig, neutral = i koe / valgt, red = feilet. Alle parene er
 * minst 6,9:1 (WCAG AA).
 */
export type PillTone = "amber" | "green" | "neutral" | "red";

const TONES: Record<PillTone, string> = {
  amber: "bg-amber-bg text-amber-fg",
  green: "bg-green-bg text-green-fg",
  neutral: "bg-neutral-bg text-neutral-fg",
  red: "bg-red-bg text-red-fg",
};

export function Pill({
  tone,
  pulse = false,
  children,
}: {
  tone: PillTone;
  /** Pulserer mens jobben pågår (av ved redusert bevegelse). */
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-3 py-1 text-[13px] font-medium whitespace-nowrap ${TONES[tone]}${
        pulse ? " animate-pulse motion-reduce:animate-none" : ""
      }`}
    >
      {children}
    </span>
  );
}
