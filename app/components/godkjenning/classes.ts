/** Felles klasser for godkjenningssiden og komponentene dens (D2a). Bare tokens. */

export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

export const LABEL = "text-sm font-medium text-ink-2 mb-4";

/** Valgknapp i en gruppe (aria-pressed), som segmentene paa /history. */
export function choiceClass(selected: boolean, extra = ""): string {
  return `min-h-11 px-4 py-2 text-sm border transition-colors ${FOCUS} ${
    selected
      ? "bg-primary border-primary text-on-primary font-medium"
      : "bg-surface border-line-strong text-ink-2 hover:text-ink hover:bg-surface-2"
  }${extra ? ` ${extra}` : ""}`;
}
