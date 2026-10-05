/**
 * Datoen paa jobbkortene og i banneret om slettede bilder (TG-NEW-117).
 * Flyttet uendret fra JobCard.tsx, saa begge viser datoen likt. Fortsatt
 * nb-NO; TG-NEW-129 PR 2 gjoer den spraakavhengig her, ett sted.
 */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
