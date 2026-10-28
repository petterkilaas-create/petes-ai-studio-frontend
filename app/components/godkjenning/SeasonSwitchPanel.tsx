"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { submitSeasonFromJob, SubmitError } from "../../lib/api";
import { seasonKey, type Season } from "../../lib/aarstid";
import {
  firstStartedJob,
  switchCost,
  switchExhausted,
  switchSeasons,
  SwitchKeys,
  toggleSwitchSeason,
  type SeasonSwitch,
} from "../../lib/aarstidBytte";
import type { Quota, QuotaEvent } from "../../lib/quota";
import { aarstidBytteErrorText, t, type Locale } from "../../lib/i18n";
import { buttonClass } from "../ui/Button";
import { cardClass } from "../ui/Card";
import { choiceClass, LABEL } from "./classes";

const CARD = cardClass("md");
const BTN_PRIMARY = buttonClass("primary");
const BTN_SECONDARY = buttonClass("secondary");

/**
 * «Lag i en annen årstid» (Dag 58, TG-NEW-273, A1) i sidepanelet paa
 * godkjenningssiden, for eieren av en aarstidsjobb i awaiting_approval eller
 * succeeded (seasonSwitch). Knappen aapner valget av maalaarstider; jobbens
 * egen aarstid er grået ut med forklaringen. «Bestill» sender
 * POST /v1/jobs/{job_id}/aarstid, og etter 202 aapnes den nye bestillingen.
 * Kostlinja viser kvoten (ingen for admin); med tom kvote er knappen grå,
 * ikke skjult. Reglene ligger i lib/aarstidBytte.ts.
 */
export function SeasonSwitchPanel({
  jobId,
  view,
  quota,
  onQuota,
  locale,
}: {
  jobId: string;
  view: SeasonSwitch;
  quota: Quota | null;
  onQuota: (event: QuotaEvent) => void;
  locale: Locale;
}) {
  const { getToken } = useAuth();
  const router = useRouter();
  const groupId = useId();
  const sameId = useId();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Season[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synkront vern mot dobbeltklikk; busy rekker ikke aa oppdatere mellom to raske klikk.
  const inFlight = useRef(false);
  const keys = useRef<SwitchKeys | null>(null);
  keys.current ??= new SwitchKeys();

  const cost = switchCost(quota);
  const exhausted = switchExhausted(quota);
  const seasons = switchSeasons(view, chosen);
  const costLine =
    cost.kind === "none" ? null : (
      <p className="text-sm text-ink-2">
        {cost.kind === "counter"
          ? t(locale, "aarstidBytte.cost", { remaining: cost.remaining })
          : t(locale, "aarstidBytte.costUnknown")}
      </p>
    );

  const order = async () => {
    if (seasons === null || exhausted || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const idempotencyKey = keys.current!.keyFor(jobId, seasons);
    try {
      const result = await submitSeasonFromJob({ jobId, seasons, idempotencyKey, getToken });
      keys.current!.accepted();
      onQuota({ kind: "accepted", quota: result.quota });
      const next = firstStartedJob(result);
      if (next !== null) {
        router.push(`/godkjenning/${encodeURIComponent(next)}`);
        return;
      }
      // Ingen jobb ble startet (travelt): bestillingen teller likevel som én.
      setError(t(locale, "aarstid.notStarted"));
    } catch (err) {
      if (err instanceof SubmitError) {
        if (err.code === "free_quota_exhausted") onQuota({ kind: "exhausted", ...err.detail });
        setError(aarstidBytteErrorText(locale, err.code));
      } else {
        setError(aarstidBytteErrorText(locale, null));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <section className={`${CARD} flex flex-col gap-3`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={exhausted}
          className={BTN_SECONDARY}
        >
          {t(locale, "aarstidBytte.open")}
        </button>
        {costLine}
      </section>
    );
  }

  return (
    <section className={`${CARD} flex flex-col gap-4`}>
      <p className={`${LABEL} mb-0`}>{t(locale, "aarstidBytte.open")}</p>
      <p className="text-sm text-ink-2">{t(locale, `aarstid.summary.source.${view.source}`)}</p>
      <div className="flex flex-col gap-2">
        <p id={groupId} className="text-sm font-medium text-ink">
          {t(locale, "aarstid.seasons")}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={groupId}>
          {view.targets.map((season) => {
            const own = season === view.own;
            const on = chosen.includes(season);
            return (
              <button
                key={season}
                type="button"
                onClick={() => setChosen((prev) => toggleSwitchSeason(view, prev, season))}
                disabled={own || busy}
                aria-pressed={own ? undefined : on}
                aria-describedby={own ? sameId : undefined}
                className={choiceClass(on, "rounded-pill disabled:opacity-50 disabled:cursor-not-allowed")}
              >
                {t(locale, seasonKey(season))}
              </button>
            );
          })}
        </div>
        <p id={sameId} className="text-sm text-ink-2">
          {t(locale, "aarstidBytte.sameSeason")}
        </p>
      </div>
      <p className="text-sm text-ink-2">{t(locale, "aarstidBytte.help")}</p>
      {costLine}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void order()}
          disabled={seasons === null || exhausted || busy}
          className={BTN_PRIMARY}
        >
          {t(locale, busy ? "aarstidBytte.ordering" : "aarstidBytte.order")}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setChosen([]);
            setError(null);
          }}
          disabled={busy}
          className={BTN_SECONDARY}
        >
          {t(locale, "action.cancel")}
        </button>
      </div>
      {error !== null && (
        <p className="text-sm text-amber-fg bg-amber-bg rounded-button p-3" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
