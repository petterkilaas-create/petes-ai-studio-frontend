import type { HTMLAttributes } from "react";

/**
 * Kort i retning A (D1, brief §8): surface, tynn kant og radius 14. Ingen
 * skygge, glød eller gradient.
 */
export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8 md:p-10",
};

export function cardClass(padding: CardPadding = "md", extra = ""): string {
  return ["rounded-card border border-line bg-surface", PADDING[padding], extra].filter(Boolean).join(" ");
}

export function Card({
  padding = "md",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { padding?: CardPadding }) {
  return <div className={cardClass(padding, className)} {...props} />;
}
