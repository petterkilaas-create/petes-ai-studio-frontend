import type { ReviewWishes, WishItem, WishReason, WishStatus, WishesSummary } from "./api";
import type { UiKey } from "./i18n";

/**
 * «Dine ønsker» (TG-NEW-263): meglerens ønsker og svaret på dem, på
 * godkjenningssiden og som en linje på kortet i Historikken. Rene regler,
 * skilt ut saa de kan testes med node --test. Bare type-importer fra api.ts:
 * den kaster ved import naar NEXT_PUBLIC_API_BASE mangler.
 *
 * Backend (#254) sender teksten bare til eieren og bare foer A1. Som ekstra
 * vern viser vi aldri tekst naar `isOwner` er false. Svarene gjelder planen
 * for moebleringen; ingen kontroll sjekker at bildet fulgte den.
 */

/** Statusene der planen ikke er laget ennaa: svaret kommer (Cowork 27.10, valg 3). */
const WAITING = new Set(["needs_review", "queued", "running"]);

/** Rekkefoelgen grunnene vises i (w1). `none` har ingen tekst. */
const REASON_ORDER: readonly Exclude<WishReason, "none">[] = [
  "rule_door",
  "rule_fixed",
  "rule_window",
  "no_space",
  "not_in_list",
  "conflict",
  "unclear",
];

/** En rad i w2: meglerens linje (eller «Ønske n»), svaret og evt. grunnen. */
export interface WishRow {
  no: number;
  /** Linja megleren skrev; null gir «Ønske {no}». */
  text: string | null;
  /** null naar planen ikke ble brukt (da staar bare linja). */
  answer: UiKey | null;
  reason: UiKey | null;
}

export interface WishesView {
  /** «Ønsket er slettet sammen med bildene.» */
  cleared: boolean;
  /** Hele ønsket som sitat (w1 og uten plan), bare for eieren. */
  quote: string | null;
  /** w2: én rad per linje. */
  rows: WishRow[];
  /** w1: én samlet linje (Cowork 27.10, valg 4). */
  summary: UiKey | null;
  /** w1: grunnene uten nummer. */
  reasons: UiKey[];
  /** Svaret kommer, ikke brukt, eller kunne ikke brukes. */
  note: UiKey | null;
  /** «Svarene gjelder planen for møbleringen. Sjekk bildet.» */
  footnote: boolean;
}

/** Svaret paa ett ønske. Uten status: «Ikke vurdert» (valg 1). */
export function answerKey(status: WishStatus | null): UiKey {
  switch (status) {
    case "followed":
      return "wishes.status.followed";
    case "partly":
      return "wishes.status.partly";
    case "not_possible":
      return "wishes.status.not_possible";
    default:
      return "wishes.status.none";
  }
}

/** Grunnen, bare ved «Ikke mulig». `none` og ukjent: ingen tekst. */
export function wishReasonKey(item: Pick<WishItem, "status" | "reason">): UiKey | null {
  if (item.status !== "not_possible") return null;
  switch (item.reason) {
    case "rule_door":
      return "wishes.reason.rule_door";
    case "rule_fixed":
      return "wishes.reason.rule_fixed";
    case "not_in_list":
      return "wishes.reason.not_in_list";
    case "no_space":
      return "wishes.reason.no_space";
    case "conflict":
      return "wishes.reason.conflict";
    case "unclear":
      return "wishes.reason.unclear";
    case "rule_window":
      return "wishes.reason.rule_window";
    default:
      return null;
  }
}

/** w1: «Tatt med» naar alle er tatt med, «Ikke tatt med» naar ingen er, ellers «Delvis tatt med». */
function w1Summary(items: readonly WishItem[]): UiKey {
  if (items.every((i) => i.status === "followed")) return "wishes.w1.followed";
  if (items.every((i) => i.status !== "followed" && i.status !== "partly")) return "wishes.w1.none";
  return "wishes.w1.partly";
}

function w1Reasons(items: readonly WishItem[]): UiKey[] {
  const keys = items.map(wishReasonKey);
  return REASON_ORDER.map((r) => `wishes.reason.${r}` as UiKey).filter((k) => keys.includes(k));
}

/**
 * Det panelet viser. `status` er jobbens status (svaret kommer mens den
 * venter eller kjoerer), `isOwner` styrer teksten.
 */
export function wishesView(wishes: ReviewWishes, job: { status: string; isOwner: boolean }): WishesView {
  const showText = job.isOwner && !wishes.cleared;
  const view: WishesView = {
    cleared: wishes.cleared,
    quote: showText && wishes.version !== "w2" ? wishes.text : null,
    rows: [],
    summary: null,
    reasons: [],
    note: null,
    footnote: false,
  };
  const planOk = wishes.version !== null && wishes.planStatus === "ok";
  if (wishes.version === null) {
    view.note = WAITING.has(job.status) ? "wishes.pending" : "wishes.notUsed";
  } else if (wishes.planStatus === "not_applicable") {
    view.note = "wishes.notUsed";
  } else if (!planOk) {
    view.note = "wishes.couldNotUse";
  }

  if (wishes.version === "w2") {
    for (const item of wishes.items) {
      const text = showText ? item.text : null;
      // Uten plan vises bare linjene megleren skrev; «Ønske n» alene sier ingenting.
      if (!planOk && text === null) continue;
      view.rows.push({
        no: item.no,
        text,
        answer: planOk ? answerKey(item.status) : null,
        reason: planOk ? wishReasonKey(item) : null,
      });
    }
    if (planOk && view.rows.length === 0) view.note = "wishes.notUsed";
  } else if (wishes.version === "w1" && planOk) {
    if (wishes.items.length === 0) {
      view.note = "wishes.notUsed";
    } else {
      view.summary = w1Summary(wishes.items);
      view.reasons = w1Reasons(wishes.items);
    }
  }
  view.footnote = planOk && (view.summary !== null || view.rows.some((r) => r.answer !== null));
  return view;
}

/** Linja paa kortet i Historikken, eller null. Aldri tekst fra ønsket. */
export function wishesSummaryText(
  summary: WishesSummary | null | undefined
): { key: UiKey; vars: Record<string, number> } | null {
  if (summary === null || summary === undefined || summary.planStatus === null) return null;
  if (summary.planStatus !== "ok") return { key: "wishes.summaryNotUsed", vars: {} };
  // 0 ønsker: ingen linje (Cowork 27.10, valg 5).
  if (summary.count === 0) return null;
  const vars = { followed: summary.followed, count: summary.count, partly: summary.partly };
  return { key: summary.partly > 0 ? "wishes.summaryPartly" : "wishes.summary", vars };
}
