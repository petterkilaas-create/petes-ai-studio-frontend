import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

/**
 * Knapper i retning A (D1, brief §8): primaer (primary med hvit tekst),
 * sekundaer og fare. Minst 44 px hoey, radius 10, synlig fokus. Bare
 * tokens, ingen hex (testes i design.test.ts).
 */
export type ButtonVariant = "primary" | "secondary" | "danger";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-button px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  danger: "border border-red-fg/40 bg-surface text-red-fg hover:bg-red-bg",
};

/** Klassene til en knapp, for elementer som ikke kan bruke Button (f.eks. fil-knappen). */
export function buttonClass(variant: ButtonVariant = "primary", extra = ""): string {
  return `${BASE} ${VARIANTS[variant]}${extra ? ` ${extra}` : ""}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

/** Lenke som ser ut som en knapp (next/link). */
export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
