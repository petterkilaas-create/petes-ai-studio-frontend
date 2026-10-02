import { fillParts, type PendingSlot } from "../../../content/marketing/fill";
import type { PendingKey, Site } from "../../../content/marketing/schema";
import { PendingMark } from "./PendingMark";

/**
 * En mal fra innholdet med verdiene fylt inn (MS3b). En verdi som venter
 * ({ pending }) vises som merkelapp der den skal staa, for eksempel
 * «Skriv til [E-POST].» Ingen hooks, saa den kan brukes overalt.
 */
export function TemplateText({
  template,
  vars,
  site,
}: {
  template: string;
  vars: Record<string, string | number | PendingSlot>;
  site: Site;
}) {
  return (
    <>
      {fillParts(template, vars).map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <PendingMark key={i} label={site.pendingLabels[part.pending as PendingKey]} />
        )
      )}
    </>
  );
}
