/**
 * Merkelapp for det som venter paa avklaring (MS3, regel 3 og 4), for
 * eksempel [JURIDISK SJEKK] eller [BILDE]. Teksten kommer fra
 * site.pendingLabels. Vises bare mens siden er bak innlogging: en test
 * hindrer lansering saa lenge noe venter (content/marketing/pending.ts).
 */
export function PendingMark({ label }: { label: string }) {
  return (
    <span className="ml-2 inline-flex items-center rounded-pill bg-amber-bg px-2 py-0.5 align-middle text-[12px] font-semibold text-amber-fg">
      {label}
    </span>
  );
}
