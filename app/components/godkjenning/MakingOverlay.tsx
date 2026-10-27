import { t, type Locale } from "../../lib/i18n";

/**
 * Laget over bildet mens en ny versjon lages (FE-3, Dag 57): et rolig
 * symbol, «Lager versjon {n} …» og «Det tar vanligvis rundt ett minutt.».
 * Siden viser det fra klikket til nytt resultat eller feil (makingImage).
 * Med prefers-reduced-motion staar symbolet stille.
 *
 * Laget dekker visningen under seg (den er `inert` saa lenge), og teksten
 * leses opp én gang (role="status").
 */
export function MakingOverlay({ version, locale }: { version: number; locale: Locale }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-button bg-ink/45 p-4">
      <div
        role="status"
        className="flex max-w-sm flex-col items-center gap-3 rounded-card bg-surface px-6 py-5 text-center shadow-md"
      >
        <span
          aria-hidden="true"
          className="h-8 w-8 rounded-full border-4 border-line border-t-ink animate-spin [animation-duration:1.8s] motion-reduce:animate-none"
        />
        <p className="font-medium text-ink">{t(locale, "compare.makingTitle", { n: version })}</p>
        <p className="text-sm text-ink-2">{t(locale, "compare.makingHint")}</p>
      </div>
    </div>
  );
}
