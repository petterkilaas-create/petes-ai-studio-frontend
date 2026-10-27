import type { UiKey } from "./i18n";
import { checklistFor } from "./checklist.ts";

/**
 * Jobber vi ikke laget, og gratisbildet tilbake (Dag 56, P3b). Rene regler,
 * skilt ut saa de kan testes med node --test. Bare type-importer fra api.ts:
 * den kaster ved import naar NEXT_PUBLIC_API_BASE mangler.
 *
 * Backend (P2) sender `code: "not_created"` og grunnkodene naar porten ikke
 * laget bildet, og `quota_return` for feilede jobber. Bare "returned" lover
 * noe: «Gratisbildet er gitt tilbake.» Alt annet, ogsaa manglende felt og
 * ukjent verdi, gir ingen tekst om gratisbildet.
 */

/** Koden for en jobb vi ikke laget (samme verdi som NOT_CREATED i api.ts). */
const NOT_CREATED = "not_created";

/** Rekkefoelgen grunnene vises i. Koder utenfor lista er ukjente. */
export const NOT_CREATED_ORDER = [
  "image_type_not_supported",
  "sky_missing",
  "sky_through_windows_only",
  "furnish_as_mismatch",
  "image_type_untested",
  "valid_runs_insufficient",
] as const;

type NotCreatedCode = (typeof NOT_CREATED_ORDER)[number];

/** Er jobben en vi ikke laget (failed med not_created)? */
export function isNotCreated(job: { status: string; code: string | null | undefined }): boolean {
  return job.status === "failed" && job.code === NOT_CREATED;
}

/** Bare "returned" lover gratisbildet tilbake. */
export function quotaReturned(quotaReturn: unknown): boolean {
  return quotaReturn === "returned";
}

function has(code: string): code is NotCreatedCode {
  return (NOT_CREATED_ORDER as readonly string[]).includes(code);
}

function reasonKey(code: NotCreatedCode, presetId: string | null, imageType: string | null): UiKey | null {
  switch (code) {
    case "image_type_not_supported":
      return "notCreated.reason.image_type_not_supported";
    case "sky_missing":
      return "notCreated.reason.sky_missing";
    case "sky_through_windows_only":
      return "notCreated.reason.sky_through_windows_only";
    case "furnish_as_mismatch":
      // Romtypen sendes ikke; retningen foelger av bildetypen, som bare
      // review-svaret har. Uten den: den noeytrale teksten.
      if (imageType === "interior") return "notCreated.reason.furnish_as_mismatch.inside";
      if (imageType === "balcony_terrace" || imageType === "exterior_facade") {
        return "notCreated.reason.furnish_as_mismatch.outside";
      }
      return "notCreated.reason.furnish_as_mismatch";
    case "image_type_untested":
      // Bare Kveldsbilde og styling feiler paa utestet bildetype (Blaa himmel stopper med valg).
      switch (checklistFor(presetId)) {
        case "kveldsbilde":
          return "notCreated.reason.image_type_untested.kveldsbilde";
        case "styling":
          return "notCreated.reason.image_type_untested.styling";
        default:
          return null;
      }
    case "valid_runs_insufficient":
      return "notCreated.reason.valid_runs_insufficient";
  }
}

/**
 * Grunnene under «Bildet ble ikke laget.»: én tekst per kode i
 * NOT_CREATED_ORDER, uten duplikater. Med utestet bildetype vises ikke
 * romtypen (Cowork 27.10, valg b): den er misvisende for f.eks. et
 * dronebilde. Ukjent kode, ukjent tjeneste eller ingen koder gir
 * `notCreated.reason.unknown`, aldri en tom liste.
 */
export function notCreatedReasons(input: {
  reasonCodes: readonly string[] | undefined;
  presetId: string | null;
  imageType?: string | null;
}): UiKey[] {
  const codes = input.reasonCodes ?? [];
  const untested = codes.includes("image_type_untested");
  const keys: UiKey[] = [];
  let neutral = codes.length === 0 || codes.some((c) => !has(c));
  for (const code of NOT_CREATED_ORDER) {
    if (!codes.includes(code)) continue;
    if (code === "furnish_as_mismatch" && untested) continue;
    const key = reasonKey(code, input.presetId, input.imageType ?? null);
    if (key === null) neutral = true;
    else if (!keys.includes(key)) keys.push(key);
  }
  if (neutral) keys.push("notCreated.reason.unknown");
  return keys;
}

/**
 * Linjene under meldingen for en feilet jobb (jobbkortet, linjene paa
 * bestillingskortet, Tjenester og siden for jobben): grunnene naar vi ikke
 * laget bildet, og «Gratisbildet er gitt tilbake.» for alle feilede jobber
 * naar `quotaReturn` er "returned" (ogsaa tekniske feil og avbrutt i et
 * stopp, Cowork 27.10, valg c). Andre statuser: ingen linjer.
 */
export function failedLines(job: {
  status: string;
  code: string | null | undefined;
  reasonCodes?: readonly string[];
  presetId: string | null;
  imageType?: string | null;
  quotaReturn?: unknown;
}): UiKey[] {
  if (job.status !== "failed") return [];
  const lines = isNotCreated(job)
    ? notCreatedReasons({ reasonCodes: job.reasonCodes, presetId: job.presetId, imageType: job.imageType })
    : [];
  if (quotaReturned(job.quotaReturn)) lines.push("notCreated.quotaReturned");
  return lines;
}

/**
 * Det samme for svaret fra pollingen paa Tjenester (status fra jobState).
 * Poll har ikke oppskriften eller bildetypen: `presetId` er bestillingen
 * siden selv sendte, og romtypen faar den noeytrale teksten.
 */
export function pollFailedLines(
  poll: { status: string; notCreated: { reasonCodes: readonly string[] } | null; quotaReturn: unknown },
  presetId: string | null
): UiKey[] {
  if (poll.status === "rejected_by_reviewer") {
    return failedLines({ status: "failed", code: "rejected_by_reviewer", presetId, quotaReturn: poll.quotaReturn });
  }
  return failedLines({
    status: poll.status,
    code: poll.notCreated !== null ? NOT_CREATED : null,
    reasonCodes: poll.notCreated?.reasonCodes,
    presetId,
    quotaReturn: poll.quotaReturn,
  });
}

/**
 * Overskriften i resultatkortet: rett etter «Ja, avbryt» i et stopp
 * «Avbrutt av deg» (Cowork 27.10); ellers linja fra outcome (etter ny
 * innlasting «Avvist av deg» som foer).
 */
export function doneTitleKey(outcomeKey: UiKey, stopDone: UiKey | null): UiKey {
  return stopDone !== null ? "stop.cancelledByYou" : outcomeKey;
}

/** Bekreftelsen etter «Ja, avbryt» i et stopp, ut fra svaret paa avgjoerelsen. */
export function stopDoneKey(quotaReturn: unknown): UiKey {
  return quotaReturned(quotaReturn) ? "stop.doneReturned" : "stop.done";
}
