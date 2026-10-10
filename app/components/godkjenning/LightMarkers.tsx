"use client";

import { useEffect, useState } from "react";
import type { InputOrientation } from "../../lib/api";
import type { Lights } from "../../lib/correction";
import { t, type Locale } from "../../lib/i18n";
import { badgePlacement, lightMarkers, lightText, type BadgePlacement } from "../../lib/lightsView";
import { markersGate } from "../../lib/orientation";

/**
 * Originalen alene med markoerer for lampene analysen fant (TG-NEW-166).
 * Markoerene er bare et lag i DOM-en over bildet: de havner aldri i et
 * nedlastet eller merket bilde (det lages i backend), og de tegnes ikke paa
 * glideren (der beskjaerer object-cover originalen).
 *
 * Bildet vises med naturlig sideforhold (w-full h-auto), saa prosentene fra
 * boksen treffer. Markoerene vises bare naar retningen i originalen er trygg
 * (orientation.ts, valg 4 A); ellers vises bildet med en kort tekst. Har
 * jobben `inputOrientation` (TG-NEW-170), hentes ikke bildet (markersGate).
 *
 * Oppfoelgingen: hver markoer har et merke A, B, C ... (valg 1 A) utenfor
 * rammen (badgePlacement), og forklaringen under bildet har det samme merket
 * og navnet fra lista. Laget paa bildet er skjult for skjermlesere;
 * forklaringen er lista de leser. To stiler (valg 2 A): fylt og stiplet.
 *
 * Megleren (`litOnly`, TG-NEW-193) ser bare lampene som tennes, alle fylt,
 * uten forklaringen av stilene og uten «Lamper uten plassering».
 */

/** Rammen rundt boksen. Lys kant med moerk ring, saa den synes paa lyse og moerke bilder. */
function outlineClass(uncertain: boolean): string {
  return `border-2 ${uncertain ? "border-dashed" : "border-solid"} border-surface ring-1 ring-ink`;
}

/** Merket: fylt (sikker) eller lyst med stiplet kant (usikker). Leses paa bildet og i forklaringen. */
function badgeClass(uncertain: boolean): string {
  return uncertain ? "bg-surface text-ink border-2 border-dashed border-ink" : "bg-primary text-on-primary border-2 border-surface";
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

export function LightMarkers({
  url,
  lights,
  inputOrientation,
  litOnly,
  locale,
}: {
  url: string;
  lights: Lights;
  inputOrientation: InputOrientation | null;
  /** Bare lampene som tennes (megleren); false er admin. */
  litOnly: boolean;
  locale: Locale;
}) {
  // Resultatet gjelder bare URL-en det ble hentet for. Avhenger av om feltet
  // finnes, ikke av objektet, saa ingenting hentes paa nytt ved hver rendring.
  const known = inputOrientation !== null;
  const [checked, setChecked] = useState<{ url: string; ok: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void markersGate(url, known).then((ok) => {
      if (alive) setChecked({ url, ok });
    });
    return () => {
      alive = false;
    };
  }, [url, known]);
  const allowed = checked !== null && checked.url === url ? checked.ok : null;

  const { markers, withoutBox } = lightMarkers(lights, { litOnly });
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-button border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={t(locale, "compare.altOriginal")} className="block w-full h-auto" />
        {allowed === true && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {markers.map((m) => {
              const place = badgePlacement(m);
              return (
                <div
                  key={m.letter}
                  className="absolute -translate-x-1/2 -translate-y-1/2 min-h-3 min-w-3"
                  style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.width}%`, height: `${m.height}%` }}
                >
                  <span className={`absolute inset-0 rounded-sm ${outlineClass(m.uncertain)}`} />
                  <span className={`absolute ${VERTICAL[place.vertical]} ${HORIZONTAL[place.horizontal]} ${BADGE} ${badgeClass(m.uncertain)}`}>
                    {m.letter}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {allowed === false && (
        <p className="text-xs text-ink-2" role="status">
          {t(locale, "markers.unavailable")}
        </p>
      )}
      {allowed === true && (
        <>
          <ol aria-label={t(locale, "markers.listLabel")} className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-ink">
            {markers.map((m) => {
              const text = lightText(locale, m.light, m.name);
              const label = [text.title, text.zone, m.uncertain ? t(locale, "correct.uncertain") : null]
                .filter((s): s is string => s !== null)
                .join(" · ");
              return (
                <li key={m.letter} className="flex items-center gap-2">
                  <span aria-hidden="true" className={`${BADGE} ${badgeClass(m.uncertain)}`}>
                    {m.letter}
                  </span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>
          {!litOnly && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-3.5 w-3.5 rounded-pill ${badgeClass(false)}`} />
                {t(locale, "markers.styleSure")}
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-3.5 w-3.5 rounded-pill ${badgeClass(true)}`} />
                {t(locale, "markers.styleUncertain")}
              </span>
            </p>
          )}
          {!litOnly && withoutBox > 0 && <p className="text-xs text-ink-2">{t(locale, "markers.noBox", { n: withoutBox })}</p>}
        </>
      )}
    </div>
  );
}
