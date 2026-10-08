"use client";

import { useEffect, useState } from "react";
import type { Lights } from "../../lib/correction";
import { t, type Locale } from "../../lib/i18n";
import { lightMarkers, lightText, type MarkerKind } from "../../lib/lightsView";
import { orientationAllowed } from "../../lib/orientation";

/**
 * Originalen alene med nummererte markoerer for lampene analysen fant
 * (TG-NEW-166). Markoerene er bare et lag i DOM-en over bildet: de havner
 * aldri i et nedlastet eller merket bilde (det lages i backend), og de tegnes
 * ikke paa glideren (der beskjaerer object-cover originalen).
 *
 * Bildet vises med naturlig sideforhold (w-full h-auto), saa prosentene fra
 * boksen treffer. Markoerene vises bare naar retningen i originalen er trygg
 * (orientation.ts, valg 4 A); ellers vises bildet med en kort tekst.
 */

/** Rammen rundt boksen. Lys kant med moerk ring, saa den synes paa lyse og moerke bilder. */
const OUTLINE: Record<MarkerKind, string> = {
  approved: "border-2 border-solid border-surface ring-1 ring-ink",
  unstable: "border-2 border-dashed border-surface ring-1 ring-ink",
  rejected: "border-2 border-solid border-line-strong ring-1 ring-ink",
};

/** Merket med nummeret: fylt (godkjent), stiplet og hult (usikker), graa kant (avvist). */
const BADGE: Record<MarkerKind, string> = {
  approved: "bg-primary text-on-primary border-2 border-surface",
  unstable: "bg-transparent text-surface border-2 border-dashed border-surface [text-shadow:0_0_3px_var(--color-ink)]",
  rejected: "bg-surface text-ink-2 border-2 border-line-strong",
};

export function LightMarkers({ url, lights, locale }: { url: string; lights: Lights; locale: Locale }) {
  // Resultatet gjelder bare URL-en det ble hentet for.
  const [checked, setChecked] = useState<{ url: string; ok: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void orientationAllowed(url).then((ok) => {
      if (alive) setChecked({ url, ok });
    });
    return () => {
      alive = false;
    };
  }, [url]);
  const allowed = checked !== null && checked.url === url ? checked.ok : null;

  const { markers, withoutBox } = lightMarkers(lights);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-button border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={t(locale, "compare.altOriginal")} className="block w-full h-auto" />
        {allowed === true && (
          <ol aria-label={t(locale, "markers.listLabel")} className="pointer-events-none absolute inset-0 m-0 list-none p-0">
            {markers.map((m, i) => {
              const text = lightText(locale, m.light, m.name);
              const label = [text.title, text.zone, m.kind === "approved" ? null : t(locale, "correct.uncertain")]
                .filter((s): s is string => s !== null)
                .join(", ");
              return (
                <li
                  key={`${m.light.key ?? m.light.id ?? "x"}-${i}`}
                  aria-label={label}
                  className="absolute -translate-x-1/2 -translate-y-1/2 min-h-3 min-w-3"
                  style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.width}%`, height: `${m.height}%` }}
                >
                  <span aria-hidden="true" className={`absolute inset-0 rounded-sm ${OUTLINE[m.kind]}`} />
                  <span
                    aria-hidden="true"
                    className={`absolute left-1/2 top-1/2 flex h-[22px] min-w-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill px-1 text-[13px] font-bold leading-none ${BADGE[m.kind]}`}
                  >
                    {m.name.number}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {allowed === false && (
        <p className="text-xs text-ink-2" role="status">
          {t(locale, "markers.unavailable")}
        </p>
      )}
      {allowed === true && withoutBox > 0 && (
        <p className="text-xs text-ink-2">{t(locale, "markers.noBox", { n: withoutBox })}</p>
      )}
    </div>
  );
}
