import type { ReactNode } from "react";

/**
 * Sidetittel (D1, brief §8): Instrument Serif (font-display) fordi tittelen
 * er 28 px eller mer, undertittel i Geist.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Knapper og filtre til hoeyre (under tittelen paa smal skjerm). */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[32px] md:text-[40px] leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
