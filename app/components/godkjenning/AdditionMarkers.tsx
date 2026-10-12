"use client";

import type { AdditionItem } from "../../lib/api";
import { additionMarkers, additionTypeText } from "../../lib/additions";
import { t, type Locale } from "../../lib/i18n";
import { badgePlacement, type BadgePlacement } from "../../lib/lightsView";

/**
 * Resultatbildet for gjeldende runde med boksene fra kontrollen av tillegg
 * (TG-NEW-199 PR 4). Boksene gjelder resultatbildet, ikke originalen (AUDIT
 * AVVIK 3), og tegnes bare som et lag i DOM-en: de havner aldri i et
 * nedlastet eller merket bilde.
 *
 * Bildet vises med naturlig sideforhold (w-full h-auto), saa prosentene fra
 * boksen treffer. Hver boks har et nummer 1, 2, 3 ... utenfor rammen, og
 * lista under har det samme nummeret. Laget paa bildet er skjult for
 * skjermlesere; lista er det de leser. Advarsel er roed og heltrukken,
 * merknad er gul og stiplet. Poster uten boks staar bare i lista.
 *
 * `location` (fritekst fra modellen) vises bare for admin (V3 A); megleren
 * ser bare typen og arten.
 */

function outlineClass(kind: AdditionItem["kind"]): string {
  return kind === "warning"
    ? "border-2 border-solid border-red-fg ring-1 ring-surface"
    : "border-2 border-dashed border-amber-fg ring-1 ring-surface";
}

function badgeClass(kind: AdditionItem["kind"]): string {
  return kind === "warning"
    ? "bg-red-fg text-surface border-2 border-surface"
    : "bg-surface text-amber-fg border-2 border-dashed border-amber-fg";
}

const BADGE = "flex h-[22px] min-w-[22px] items-center justify-center rounded-pill px-1 text-[13px] font-bold leading-none";

const VERTICAL: Record<BadgePlacement["vertical"], string> = {
  above: "bottom-full mb-0.5",
  below: "top-full mt-0.5",
  inside: "top-1/2 -translate-y-1/2",
};

const HORIZONTAL: Record<BadgePlacement["horizontal"], string> = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

function itemLabel(locale: Locale, item: AdditionItem, admin: boolean): string {
  const kind = t(locale, item.kind === "warning" ? "additions.kindWarning" : "additions.kindNote");
  return [additionTypeText(locale, item.type, 1), kind, admin ? item.location : null]
    .filter((s): s is string => s !== null && s !== "")
    .join(" · ");
}

export function AdditionMarkers({
  url,
  items,
  admin,
  locale,
}: {
  /** Gjeldende rundes merkede forhaandsvisning (aldri miniatyren, den er beskaaret). */
  url: string;
  items: readonly AdditionItem[];
  admin: boolean;
  locale: Locale;
}) {
  const { markers, withoutBox } = additionMarkers(items);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-button border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={t(locale, "review.result")} className="block w-full h-auto" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {markers.map((m) => {
            const place = badgePlacement(m);
            return (
              <div
                key={m.number}
                className="absolute -translate-x-1/2 -translate-y-1/2 min-h-3 min-w-3"
                style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.width}%`, height: `${m.height}%` }}
              >
                <span className={`absolute inset-0 rounded-sm ${outlineClass(m.item.kind)}`} />
                <span className={`absolute ${VERTICAL[place.vertical]} ${HORIZONTAL[place.horizontal]} ${BADGE} ${badgeClass(m.item.kind)}`}>
                  {m.number}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {markers.length > 0 && (
        <ol aria-label={t(locale, "additions.listLabel")} className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-ink">
          {markers.map((m) => (
            <li key={m.number} className="flex items-start gap-2">
              <span aria-hidden="true" className={`${BADGE} shrink-0 ${badgeClass(m.item.kind)}`}>
                {m.number}
              </span>
              <span className="min-w-0 break-words">{itemLabel(locale, m.item, admin)}</span>
            </li>
          ))}
        </ol>
      )}
      {withoutBox.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-ink-2">{t(locale, "additions.noBox", { n: withoutBox.length })}</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
            {withoutBox.map((item, i) => (
              <li key={i} className="break-words">
                {itemLabel(locale, item, admin)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
