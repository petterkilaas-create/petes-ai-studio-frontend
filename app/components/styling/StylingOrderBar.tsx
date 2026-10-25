import type { ReactNode } from "react";

/**
 * Den faste bestillingslinja for Digital styling (D-3 kompakt): sticky
 * nederst i kortet mens man ruller gjennom valget, og paa sin vanlige plass
 * naar man er forbi, saa den aldri dekker noe under seg. Sammendraget kommer
 * fra stylingSummary; knappen («Bestill», samme handleRun og runDisabled som
 * foer) kommer fra siden.
 *
 * PC: sammendraget, og under det det som mangler. Mobil: én kort linje
 * (det som mangler, ellers stiler og pynt) og knappen, over
 * safe-area-inset-bottom. Negative marger lik kortets padding (p-8 md:p-10),
 * saa linja gaar kant til kant i kortet.
 */
export function StylingOrderBar({
  text,
  short,
  missing,
  children,
}: {
  text: string;
  short: string;
  missing: string | null;
  children: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-8 flex items-center justify-between gap-4 border-t border-line bg-surface px-8 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:-mx-10 md:px-10">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink sm:hidden">{missing ?? short}</p>
        <p className="hidden text-sm font-medium text-ink sm:block">{text}</p>
        {missing !== null && <p className="hidden text-[13px] text-ink-2 sm:block">{missing}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
