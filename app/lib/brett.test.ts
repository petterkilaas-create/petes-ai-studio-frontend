import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssignmentError,
  parseResult,
  type AssignmentImage,
  type AssignmentResult,
  type OrderJobsResult,
  type OrderJobsWireItem,
} from "./assignments.ts";
import { ORDER_REFRESH_MAX_MS, AUTO_REFRESH_MAX_MS, startAutoRefresh, type RefreshResult } from "./autoRefresh.ts";
import {
  addToImages,
  ITEM_FIELDS,
  itemKey,
  loadDraft,
  removeItem,
  replaceItem,
  saveDraft,
  toWire,
  type BoardItem,
  type DraftStorage,
} from "./board.ts";
import {
  addChoices,
  applySheet,
  badgeLabel,
  boardServices,
  boardTotals,
  EMPTY_PANEL,
  indoorImages,
  itemLabel,
  looksIndoor,
  mixedText,
  panelChoices,
  panelForNewSelection,
  panelFromItem,
  quotaPlan,
  resultLabel,
  selectRange,
  serviceRow,
  removeSheet,
  removeText,
  sheetButtons,
  sheetStart,
  toggleSelected,
  type PanelState,
  type SheetTarget,
} from "./brett.ts";
import { BOARD_SERVICES } from "./board.ts";
import { EMPTY_STYLING } from "./styling.ts";
import { codeText, DICTIONARIES, t } from "./i18n/index.ts";
import {
  CallKeys,
  notStartedText,
  sendRemaining,
  startPlan,
  stopText,
  unsentItems,
  type StartStop,
} from "./orderStart.ts";
import {
  applyMove,
  dragTarget,
  isProcessing,
  keepImageUrls,
  menuTarget,
  orderCheckHref,
  orderServicesHref,
  orderStartedHref,
  parseStarted,
  positionOf,
  resultOpenHref,
} from "./ordrer.ts";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

/**
 * FE-3 (TG-NEW-277): bildebrettet, oppsummeringen og start, resultatene paa
 * bildesiden og dra og slipp (tillegget). Reglene testes som rene funksjoner;
 * sidene leses som tekst (node --test laster ikke .tsx). Ingen kall mot backend.
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const PAGES = ["(app)/ordrer/[id]/tjenester/page.tsx", "(app)/ordrer/[id]/kontroll/page.tsx"];
const COMPONENTS = [
  "components/ordre/ServiceBoard.tsx",
  "components/ordre/BoardPanel.tsx",
  "components/ordre/ServiceSheet.tsx",
  "components/ordre/ServiceBadge.tsx",
  "components/ordre/OrderCheck.tsx",
  "components/ordre/ResultList.tsx",
  "components/ordre/LoadState.tsx",
  "components/ordre/ImageCard.tsx",
  "components/ordre/OrderImages.tsx",
];

function image(id: string, position: number, extra: Partial<AssignmentImage> = {}): AssignmentImage {
  return {
    id,
    position,
    room: null,
    fileName: `${id}.jpg`,
    width: 4000,
    height: 3000,
    thumbUrl: null,
    originalUrl: null,
    displayStatus: "original_only",
    results: [],
    ...extra,
  };
}

function result(extra: Record<string, unknown> = {}): AssignmentResult {
  const r = parseResult({
    result_id: "r1",
    service: "scene_transform",
    preset_id: "skumring",
    order_service: "skumring",
    option: null,
    service_label: "Kveldsbilde",
    status: "awaiting_approval",
    display_status: "to_review",
    version: 1,
    ...extra,
  });
  assert.ok(r);
  return r;
}

// --- brettet -> items (K 2.7) ------------------------------------------------------

const PANEL: PanelState = {
  ...EMPTY_PANEL,
  dusk: { style: "warm_dusk_v3", sky: "light_clouds" },
  duskImageType: "exterior",
  skyImageType: "aerial",
  styling: {
    furnishAs: "living",
    roomEmpty: true,
    styles: ["styling_japandi", "styling_funkis"],
    decor: 3,
    wishes: "  Et stort teppe  ",
  },
  aarstid: { source: "sommer", seasons: ["vinter", "hoest"] },
};

function wireFor(service: Parameters<typeof panelChoices>[0], panel: PanelState = PANEL): OrderJobsWireItem[] {
  const choices = panelChoices(service, panel);
  assert.ok(choices, service);
  return addChoices([], ["img1"], choices).map(toWire);
}

test("alle fem tjenestene er paa i panelet, i rekkefoelgen fra skissen", () => {
  assert.deepEqual(boardServices(), ["skumring", "styling", "aarstid", "klart_vaer", "skjul_ansikter"]);
});

test("skumring: stil, tid og himmel fra kortet, og bildetypen naar den er valgt (K 2.7)", () => {
  assert.deepEqual(wireFor("skumring"), [
    {
      image_id: "img1",
      service: "skumring",
      dusk_time: "early",
      dusk_sky: "light_clouds",
      dusk_style: "warm_dusk_v3",
      image_type_hint: "exterior",
    },
  ]);
  // «La analysen avgjøre» sendes ikke.
  const auto = wireFor("skumring", { ...PANEL, duskImageType: "auto" })[0];
  assert.equal("image_type_hint" in auto, false);
  // Drone godtas ikke for kveldsbildet (som paa Tjenester): sendes ikke.
  assert.equal("image_type_hint" in wireFor("skumring", { ...PANEL, duskImageType: "aerial" })[0], false);
});

test("klart vaer: bare bildetypen, og ingen felt uten valg", () => {
  assert.deepEqual(wireFor("klart_vaer"), [{ image_id: "img1", service: "klart_vaer", image_type_hint: "aerial" }]);
  assert.deepEqual(wireFor("klart_vaer", { ...PANEL, skyImageType: "auto" }), [{ image_id: "img1", service: "klart_vaer" }]);
});

test("styling: ett element per stil med option, furnish_as, room_empty_confirmed, decor_level og oensket (trimmet, bare stue)", () => {
  assert.deepEqual(wireFor("styling"), [
    {
      image_id: "img1",
      service: "styling",
      option: "styling_japandi",
      furnish_as: "living",
      room_empty_confirmed: true,
      decor_level: 3,
      wishes: "Et stort teppe",
    },
    {
      image_id: "img1",
      service: "styling",
      option: "styling_funkis",
      furnish_as: "living",
      room_empty_confirmed: true,
      decor_level: 3,
      wishes: "Et stort teppe",
    },
  ]);
  const kitchen = wireFor("styling", { ...PANEL, styling: { ...PANEL.styling, furnishAs: "bedroom", decor: null } })[0];
  assert.equal("wishes" in kitchen, false);
  assert.equal("decor_level" in kitchen, false);
});

test("styling krever romtype, «rommet er tomt» og en stil; aarstid krever kilden og en aarstid", () => {
  assert.equal(panelChoices("styling", { ...PANEL, styling: { ...PANEL.styling, roomEmpty: false } }), null);
  assert.equal(panelChoices("styling", { ...PANEL, styling: { ...PANEL.styling, furnishAs: null } }), null);
  assert.equal(panelChoices("styling", { ...PANEL, styling: { ...PANEL.styling, styles: [] } }), null);
  assert.equal(panelChoices("aarstid", { ...PANEL, aarstid: { source: null, seasons: [] } }), null);
  assert.equal(panelChoices("aarstid", { ...PANEL, aarstid: { source: "sommer", seasons: [] } }), null);
});

test("aarstid: ett element per maalaarstid med option, source_season og image_type_hint exterior", () => {
  assert.deepEqual(wireFor("aarstid"), [
    { image_id: "img1", service: "aarstid", option: "hoest", source_season: "sommer", image_type_hint: "exterior" },
    { image_id: "img1", service: "aarstid", option: "vinter", source_season: "sommer", image_type_hint: "exterior" },
  ]);
});

test("skjul ansikter: bare image_id og service", () => {
  assert.deepEqual(wireFor("skjul_ansikter"), [{ image_id: "img1", service: "skjul_ansikter" }]);
});

test("hvert element har bare feltene i K 2.7 for tjenesten (ellers unknown_field)", () => {
  for (const service of boardServices()) {
    const allowed = new Set(["image_id", "service", ...ITEM_FIELDS[service]]);
    if (service === "styling" || service === "aarstid") allowed.add("option");
    if (service === "aarstid") allowed.add("source_season");
    for (const wire of wireFor(service)) {
      for (const key of Object.keys(wire)) assert.ok(allowed.has(key), `${service}: ${key}`);
    }
  }
});

test("to tjenester paa samme bilde gir to elementer; to kveldsbilder med ulik stil ogsaa; samme valg gir ett", () => {
  let items = addChoices([], ["a"], panelChoices("skumring", PANEL)!);
  items = addChoices(items, ["a"], panelChoices("skjul_ansikter", PANEL)!);
  assert.equal(items.length, 2);
  items = addChoices(items, ["a"], panelChoices("skumring", { ...PANEL, dusk: { style: "nordic_blue_hour_v2", sky: "clear" } })!);
  assert.equal(items.length, 3);
  items = addChoices(items, ["a"], panelChoices("skumring", PANEL)!);
  assert.equal(items.length, 3);
});

test("oenskene er ikke en del av valget: nytt oenske oppdaterer elementet, ingen dublett", () => {
  let items = addChoices([], ["a"], panelChoices("styling", PANEL)!);
  items = addChoices(items, ["a"], panelChoices("styling", { ...PANEL, styling: { ...PANEL.styling, wishes: "Lyse farger" } })!);
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.fields?.wishes === "Lyse farger"));
});

test("«Endre»: panelet faar valgene fra elementet, og elementet byttes paa samme bilde", () => {
  const items = addChoices([], ["a", "b"], panelChoices("skumring", PANEL)!);
  const panel = panelFromItem(items[0], EMPTY_PANEL);
  assert.deepEqual(panel.dusk, PANEL.dusk);
  assert.equal(panel.duskImageType, "exterior");
  const next = replaceItem(items, itemKey(items[0]), panelChoices("skumring", { ...panel, duskImageType: "auto" })!);
  assert.equal(next.length, 2);
  assert.deepEqual(next.map((i) => i.imageId).sort(), ["a", "b"]);
  assert.equal(next.find((i) => i.imageId === "a")?.fields?.image_type_hint, undefined);
  const styled = addChoices([], ["a"], panelChoices("styling", PANEL)!);
  const sp = panelFromItem(styled[1], EMPTY_PANEL).styling;
  assert.deepEqual(sp, { furnishAs: "living", roomEmpty: true, styles: ["styling_funkis"], decor: 3, wishes: "Et stort teppe" });
  const season = panelFromItem(addChoices([], ["a"], panelChoices("aarstid", PANEL)!)[0], EMPTY_PANEL).aarstid;
  assert.deepEqual(season, { source: "sommer", seasons: ["hoest"] });
});

test("ny avkrysning: tomt rom, aarstiden bildet er tatt i og bildetypen nullstilles; stilen staar", () => {
  const next = panelForNewSelection(PANEL);
  assert.equal(next.styling.roomEmpty, false);
  assert.deepEqual(next.styling.styles, PANEL.styling.styles);
  assert.deepEqual(next.aarstid, { source: null, seasons: [] });
  assert.equal(next.duskImageType, "auto");
  assert.deepEqual(next.dusk, PANEL.dusk);
});

test("utkastet tar vare paa feltene, og bare feltene tjenesten har", () => {
  const data = new Map<string, string>();
  const storage: DraftStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  const items = addChoices([], ["a"], panelChoices("styling", PANEL)!);
  assert.equal(saveDraft(storage, "asg", items), true);
  assert.deepEqual(loadDraft(storage, "asg", ["a"])?.items, items);
  data.set("ordre.brett.asg.v1", JSON.stringify({ items: [{ imageId: "a", service: "skjul_ansikter", fields: { evil: "x" } }] }));
  assert.deepEqual(loadDraft(storage, "asg", ["a"])?.items, [{ imageId: "a", service: "skjul_ansikter", option: null, sourceSeason: null }]);
});

test("navnene: tjenesten og valget paa elementet, og resultatet fra order_service og option", () => {
  const [dusk] = addChoices([], ["a"], panelChoices("skumring", PANEL)!);
  assert.equal(itemLabel("nb", dusk), `Kveldsbilde · ${codeText("nb", "duskStyle", "warm_dusk_v3")}`);
  const [, funkis] = addChoices([], ["a"], panelChoices("styling", PANEL)!);
  assert.equal(itemLabel("nb", funkis), "Digital styling · Funkis");
  assert.equal(resultLabel("nb", result({ order_service: "aarstid", option: "vinter" })), "Årstider · Vinter");
  assert.equal(resultLabel("en", result({ order_service: "skjul_ansikter" })), "Hide faces");
  // Eldre jobb uten order_service: service_label fra backend.
  assert.equal(resultLabel("nb", result({ order_service: null, service: "x", service_label: "Noe" })), "Noe");
});

// --- avkrysningen og oppsummeringen ---------------------------------------------------

test("avkrysning: klikk veksler, Shift-klikk krysser av alt mellom forrige og dette", () => {
  const order = ["a", "b", "c", "d", "e"];
  assert.deepEqual(toggleSelected(["a"], "a"), []);
  assert.deepEqual(toggleSelected([], "b"), ["b"]);
  assert.deepEqual(selectRange(order, ["b"], "b", "d"), ["b", "c", "d"]);
  assert.deepEqual(selectRange(order, ["e"], "e", "c"), ["e", "c", "d"]);
  assert.deepEqual(selectRange(order, [], null, "c"), ["c"]);
});

test("oppsummeringen: resultater per tjeneste, bare original, og kvoten (Skjul ansikter er gratis)", () => {
  const images = [image("a", 1), image("b", 2), image("c", 3), image("d", 4, { results: [result()] })];
  let items: BoardItem[] = addChoices([], ["a"], panelChoices("skumring", PANEL)!);
  items = addChoices(items, ["b"], panelChoices("skjul_ansikter", PANEL)!);
  const totals = boardTotals(images, items);
  assert.equal(totals.results, 2);
  assert.equal(totals.perService.skumring, 1);
  assert.equal(totals.perService.skjul_ansikter, 1);
  // c har ingenting; d har et resultat fra foer.
  assert.equal(totals.originalOnly, 1);
  assert.equal(totals.quotaItems, 1);
  assert.deepEqual(quotaPlan({ limited: false }, 5), { kind: "unlimited" });
  assert.deepEqual(quotaPlan(null, 5), { kind: "unknown" });
  assert.deepEqual(quotaPlan({ limited: true, remaining: 2, limit: 3 }, 5), {
    kind: "limited",
    need: 5,
    remaining: 2,
    limit: 3,
    over: 3,
  });
  assert.equal(t("nb", "check.quota.unlimited"), "Kvoten er ubegrenset.");
});

// --- start: deling og noekkelregelen ------------------------------------------------

function manyItems(n: number): BoardItem[] {
  const ids = Array.from({ length: n }, (_, i) => `img_${i}`);
  return addToImages([], ids, { service: "skjul_ansikter" });
}

function ok(items: OrderJobsWireItem[], extra: Partial<OrderJobsResult> = {}): OrderJobsResult {
  return {
    assignmentId: "asg",
    duplicate: false,
    items: items.map((it, index) => ({ index, imageId: it.image_id, service: it.service, resultId: `job_${index}`, status: "queued", code: null })),
    quota: null,
    ...extra,
  };
}

test("start: 100 elementer gir kall paa 80 og 20, i rekkefoelgen paa brettet", async () => {
  const sent: number[] = [];
  const { progress, stop } = await sendRemaining(startPlan(manyItems(100)), {
    keys: new CallKeys(),
    send: async (items) => {
      sent.push(items.length);
      return ok(items);
    },
  });
  assert.deepEqual(sent, [80, 20]);
  assert.deepEqual(stop, { kind: "done" });
  assert.equal(progress.outcomes.length, 100);
  assert.ok(progress.outcomes.every((o) => o.started));
  assert.deepEqual(unsentItems(progress), []);
});

test("noekkelen: ny for hvert kall, samme ved nytt forsoek etter nettfeil, glemt etter svar", async () => {
  let n = 0;
  const keys = new CallKeys(() => `k${++n}`);
  const seen: string[] = [];
  let failNext = true;
  const send = async (items: OrderJobsWireItem[], key: string) => {
    seen.push(key);
    if (seen.length === 2 && failNext) {
      failNext = false;
      throw new TypeError("Failed to fetch");
    }
    return ok(items);
  };
  let { progress, stop } = await sendRemaining(startPlan(manyItems(100)), { keys, send });
  assert.deepEqual(stop, { kind: "network" });
  assert.equal(progress.sent, 1);
  // Det som ikke er sendt, blir igjen i utkastet.
  assert.equal(unsentItems(progress).length, 20);
  ({ progress, stop } = await sendRemaining(progress, { keys, send }));
  assert.deepEqual(stop, { kind: "done" });
  // Kall 1: k1. Kall 2: k2, nettfeil, nytt forsoek med k2. Glemt etter svaret: neste kall faar k3.
  assert.deepEqual(seen, ["k1", "k2", "k2"]);
  assert.equal(keys.keyFor("{}"), "k3");
});

test("noekkelen: tidsavbrudd (AbortError) er som nettfeil; et feilsvar glemmer noekkelen", async () => {
  let n = 0;
  const keys = new CallKeys(() => `k${++n}`);
  const plan = startPlan(manyItems(2));
  const timeout = await sendRemaining(plan, {
    keys,
    send: async () => {
      throw new DOMException("timeout", "TimeoutError");
    },
  });
  assert.deepEqual(timeout.stop, { kind: "network" });
  const body = JSON.stringify(plan.chunks[0].map(toWire));
  assert.equal(keys.keyFor(body), "k1");
  const failed = await sendRemaining(plan, {
    keys,
    send: async () => {
      throw new AssignmentError(503, "quota_unavailable");
    },
  });
  assert.equal(failed.stop.kind, "error");
  // Et nytt kall med samme body etter et svar er en ny bestilling: ny noekkel.
  assert.equal(keys.keyFor(body), "k2");
});

test("svaret per element: startet, ikke startet med koden, og duplikatsvar uten kode", async () => {
  const items = manyItems(3);
  const { progress } = await sendRemaining(startPlan(items), {
    keys: new CallKeys(),
    send: async (wire) => ({
      assignmentId: "asg",
      duplicate: true,
      items: [
        { index: 0, imageId: wire[0].image_id, service: "skjul_ansikter", resultId: "j0", status: "queued", code: null },
        { index: 1, imageId: wire[1].image_id, service: "skjul_ansikter", resultId: null, status: "not_started", code: "service_already_on_image" },
        { index: 2, imageId: wire[2].image_id, service: "skjul_ansikter", resultId: null, status: "not_started", code: null },
      ],
      quota: { limited: true, used: 3, limit: 3, remaining: 0 },
    }),
  });
  assert.deepEqual(
    progress.outcomes.map((o) => [o.started, o.code]),
    [
      [true, null],
      [false, "service_already_on_image"],
      [false, null],
    ]
  );
  assert.deepEqual(progress.quota, { limited: true, used: 3, limit: 3, remaining: 0 });
  assert.match(notStartedText("nb", "service_already_on_image"), /^Finnes allerede/);
  assert.equal(notStartedText("nb", null), DICTIONARIES.nb.generic.assignmentNotStarted);
});

const NOT_STARTED = [
  "free_quota_exhausted",
  "daily_capacity_reached",
  "quota_unavailable",
  "duplicate_request",
  "capacity",
  "job_create_failed",
  "submit_error",
  "service_already_on_image",
];
const ITEM_CODES = [
  "image_not_found",
  "unknown_service",
  "unknown_field",
  "required",
  "invalid_value",
  "room_empty_not_confirmed",
  "season_source_not_supported",
  "season_target_not_supported",
  "invalid_image_type_hint",
  "image_type_hint_not_supported",
  "too_many_items",
];

test("ordlista: hver not_started-kode og hver item_code i K 2.7 har egen tekst paa nb og en", () => {
  for (const locale of ["nb", "en"] as const) {
    const codes = DICTIONARIES[locale].codes;
    for (const code of NOT_STARTED) assert.ok(Object.hasOwn(codes.assignmentNotStarted, code), `${locale} ${code}`);
    for (const code of ITEM_CODES) assert.ok(Object.hasOwn(codes.assignmentItemError, code), `${locale} ${code}`);
    for (const field of ["dusk_sky", "furnish_as", "room_empty_confirmed", "option", "source_season", "items"]) {
      assert.ok(Object.hasOwn(codes.assignmentItemField, field), `${locale} ${field}`);
    }
    for (const code of ["service_disabled", "original_missing", "idempotency_key_required", "invalid_idempotency_key", "quota_unavailable", "job_create_failed"]) {
      assert.ok(Object.hasOwn(codes.assignmentError, code), `${locale} ${code}`);
    }
  }
});

test("400 invalid_items peker paa bildet og feltet", async () => {
  const items = addChoices([], ["a", "b"], panelChoices("skumring", PANEL)!);
  const { stop } = await sendRemaining(startPlan(items), {
    keys: new CallKeys(),
    send: async () => {
      throw new AssignmentError(400, "invalid_items", { code: "invalid_items", index: 1, field: "dusk_sky", item_code: "invalid_value" });
    },
  });
  assert.equal(stop.kind, "error");
  const err = stop as Extract<StartStop, { kind: "error" }>;
  assert.equal(err.item?.imageId, "b");
  assert.equal(err.field, "dusk_sky");
  assert.equal(
    stopText("nb", err, { imageNumber: 2, label: "Kveldsbilde" }),
    "Bilde 2 (Kveldsbilde), Himmel: Valget kan ikke brukes."
  );
  // too_many_items har index null og field items.
  const tooMany: Extract<StartStop, { kind: "error" }> = { kind: "error", code: "invalid_items", item: null, field: "items", itemCode: "too_many_items" };
  assert.equal(stopText("nb", tooMany, null), "Bestillingen: For mange bearbeidinger i ett kall.");
});

// --- bildesiden: resultatene og pollingen ------------------------------------------------

test("results: order_service og option fra #271 leses; «Åpne» til ordresiden (FE-4), ikke for det som ikke ble startet", () => {
  const r = result({ order_service: "styling", option: "styling_japandi" });
  assert.equal(r.orderService, "styling");
  assert.equal(r.option, "styling_japandi");
  assert.equal(resultOpenHref("a1", "i1", result({ display_status: "to_review" })), "/ordrer/a1?bilde=i1&resultat=r1");
  assert.equal(resultOpenHref("a1", "i1", result({ display_status: "failed" })), "/ordrer/a1?bilde=i1&resultat=r1");
  assert.equal(resultOpenHref("a1", "i1", result({ display_status: "not_started" })), null);
});

test("pollingen: mens noe behandles, og forrige lenke beholdes til den er gammel", () => {
  const counts = { images: 1, results: 1, processing: 0, toReview: 0, needsAnswer: 0, approved: 0, notUsed: 0, failed: 0 };
  assert.equal(isProcessing({ counts, images: [image("a", 1, { results: [result({ display_status: "processing" })] })] }), true);
  assert.equal(isProcessing({ counts: { ...counts, processing: 1 }, images: [] }), true);
  assert.equal(isProcessing({ counts, images: [image("a", 1)] }), false);
  const prev = [image("a", 1, { thumbUrl: "https://x/a?sig=1" })];
  const next = [image("a", 1, { thumbUrl: "https://x/a?sig=2", results: [result()] }), image("b", 2, { thumbUrl: "https://x/b" })];
  const kept = keepImageUrls(prev, next, true);
  assert.equal(kept[0].thumbUrl, "https://x/a?sig=1");
  assert.equal(kept[0].results.length, 1);
  assert.equal(kept[1].thumbUrl, "https://x/b");
  assert.equal(keepImageUrls(prev, next, false)[0].thumbUrl, "https://x/a?sig=2");
});

test("pollingen har tak paa 30 minutter paa bildesiden (Historikk beholder 10)", async () => {
  assert.equal(ORDER_REFRESH_MAX_MS, 30 * 60_000);
  assert.equal(AUTO_REFRESH_MAX_MS, 10 * 60_000);
  let now = 0;
  let calls = 0;
  const timers: (() => void)[] = [];
  const control = startAutoRefresh({
    refresh: async (): Promise<RefreshResult> => {
      calls++;
      return { ok: true, working: true };
    },
    hidden: () => false,
    now: () => now,
    setTimer: (fn, ms) => {
      timers.push(() => {
        now += ms;
        fn();
      });
      return timers.length;
    },
    clearTimer: () => {},
    maxMs: ORDER_REFRESH_MAX_MS,
  });
  // 5 s per henting: 359 hentinger foer 30 minutter, og ingen etter.
  for (let i = 0; i < 400 && timers.length > 0; i++) {
    timers.shift()!();
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(calls, 359);
  assert.ok(calls > AUTO_REFRESH_MAX_MS / 5_000, "fortsetter etter 10 minutter");
  assert.equal(timers.length, 0);
  control.stop();
  const src = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(src, /useAutoRefresh\(processing, fetchAssignment, refreshKey, ORDER_REFRESH_MAX_MS\);/);
  assert.match(src, /getAssignment\(requestRef\.current, assignmentId\)/);
});

test("stiene og ?startet= fra oppsummeringen", () => {
  assert.equal(orderServicesHref("a b"), "/ordrer/a%20b/tjenester");
  assert.equal(orderCheckHref("x"), "/ordrer/x/kontroll");
  assert.equal(orderStartedHref("x", 3), "/ordrer/x/bilder?startet=3");
  assert.equal(parseStarted("3"), 3);
  assert.equal(parseStarted(undefined), null);
  assert.equal(parseStarted("-1"), null);
  assert.equal(parseStarted(["7"]), 7);
});

// --- dra og slipp (tillegget) -----------------------------------------------------------

const ids = (images: readonly AssignmentImage[]) => images.map((i) => i.id).join("");

test("dra og slipp: ny plass regnes fra plass til plass, og slipp paa seg selv gir ingenting", () => {
  const images = ["a", "b", "c", "d"].map((id, i) => image(id, i + 1));
  assert.equal(dragTarget(images, "c", "a"), 1);
  assert.equal(dragTarget(images, "a", "d"), 4);
  assert.equal(dragTarget(images, "b", "b"), null);
  assert.equal(dragTarget(images, "b", null), null);
  assert.equal(ids(applyMove(images, "c", 1)), "cabd");
  assert.equal(ids(applyMove(images, "a", 4)), "bcda");
});

test("dra og slipp: feiler PATCH, settes bildet tilbake paa plassen det kom fra", () => {
  const images = ["a", "b", "c", "d"].map((id, i) => image(id, i + 1));
  const from = positionOf(images, "c")!;
  const moved = applyMove(images, "c", 1);
  assert.equal(ids(applyMove(moved, "c", from)), "abcd");
  const src = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(src, /setImages\(\(prev\) => applyMove\(prev, image\.id, position\)\);/);
  assert.match(src, /setImages\(\(prev\) => applyMove\(prev, image\.id, from\)\);\s*setMoveError\(assignmentErrorCode\(err\)\);/);
});

test("menyen: Flytt først, opp, ned og sist; null der bildet allerede staar", () => {
  const images = ["a", "b", "c"].map((id, i) => image(id, i + 1));
  assert.equal(menuTarget(images, "c", "first"), 1);
  assert.equal(menuTarget(images, "b", "up"), 1);
  assert.equal(menuTarget(images, "b", "down"), 3);
  assert.equal(menuTarget(images, "a", "last"), 3);
  assert.equal(menuTarget(images, "a", "first"), null);
  assert.equal(menuTarget(images, "c", "last"), null);
  assert.equal(menuTarget(images, "c", "down"), null);
});

test("dra og slipp: mus, finger og tastatur; kunngjoeringer og merknaden fra ordlista", () => {
  const src = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(src, /useSensor\(CardMouseSensor/);
  assert.match(src, /useSensor\(TouchSensor/);
  assert.match(src, /useSensor\(KeyboardSensor, \{ coordinateGetter: sortableKeyboardCoordinates \}\)/);
  assert.match(src, /screenReaderInstructions: \{ draggable: t\(locale, "orders\.dnd\.instructions"\) \}/);
  assert.match(src, /t\(locale, "orders\.dragHint"\)/);
  const card = withoutComments(read("components/ordre/ImageCard.tsx"));
  assert.match(card, /setActivatorNodeRef/);
  assert.match(card, /touch-none/);
  assert.match(card, /role="menu"/);
  assert.match(card, /role="menuitem"/);
  for (const locale of ["nb", "en"] as const) {
    for (const key of ["orders.dragHint", "orders.dragHandle", "orders.moveMenu", "orders.move.first", "orders.move.up", "orders.move.down", "orders.move.last", "orders.dnd.instructions", "orders.dnd.start", "orders.dnd.over", "orders.dnd.cancel", "orders.moved"] as const) {
      assert.ok(DICTIONARIES[locale].ui[key].length > 0, `${locale} ${key}`);
    }
  }
  assert.equal(t("nb", "orders.dragHint"), "Dra bildene for å endre rekkefølgen. Rekkefølgen blir nummereringen i leveransen.");
  assert.equal(t("nb", "orders.moved", { from: 3, n: 1 }), "Bilde 3 er flyttet til plass 1.");
});

// --- sidene som tekst --------------------------------------------------------------------

test("de nye sidene sjekker flagget paa /ordrer og har ingen synlig tekst skrevet rett inn", () => {
  for (const rel of PAGES) {
    const src = withoutComments(read(rel));
    assert.match(src, /^"use client";/, rel);
    assert.match(src, /if \(!isPageEnabled\(ORDERS_PATH\)\) return <ServiceUnavailable \/>;/, rel);
  }
  for (const rel of [...PAGES, ...COMPONENTS]) assert.deepEqual(literalTextsInFile(read(rel)), [], rel);
});

test("brettet: dagens velgere i vinduet, utkastet i localStorage, og videre til oppsummeringen", () => {
  // FE-3b: velgerne staar i vinduet (ServiceSheet) i full bredde, ikke i panelet.
  const sheet = withoutComments(read("components/ordre/ServiceSheet.tsx"));
  for (const picker of ["<DuskChoicePicker", "<StylingChoicePicker", "<AarstidChoicePicker", "<ImageTypeChoice"]) {
    assert.ok(sheet.includes(picker), picker);
  }
  assert.equal(sheet.match(/\binDialog\b/g)?.length, 2);
  assert.match(sheet, /dialog\.showModal\(\);/);
  assert.match(sheet, /dialog\.addEventListener\("close", close\);/);
  assert.match(sheet, /aria-labelledby=\{titleId\}/);
  assert.match(sheet, /w-\[min\(720px,100vw\)\]/);
  assert.match(sheet, /h-dvh/);
  const panel = withoutComments(read("components/ordre/BoardPanel.tsx"));
  assert.doesNotMatch(panel, /ChoicePicker|ImageTypeChoice/);
  assert.equal(panel.match(/<Button\b/g)?.length, 1);
  const board = withoutComments(read("components/ordre/ServiceBoard.tsx"));
  assert.match(board, /saveDraft\(browserStorage\(\), assignmentId, next\);/);
  assert.match(board, /loadDraft\(browserStorage\(\), assignmentId, assignment\.images\.map\(\(img\) => img\.id\)\)/);
  assert.match(board, /aria-pressed=\{on\}/);
  assert.match(board, /e\.shiftKey \? selectRange\(order, selected, anchor, id\)/);
  assert.match(board, /<ButtonLink href=\{orderCheckHref\(assignmentId\)\}>/);
});

test("oppsummeringen: tidsavbrudd, utkastet oppdateres per kall og toemmes, og bildesiden etterpaa", () => {
  const src = withoutComments(read("components/ordre/OrderCheck.tsx"));
  assert.match(src, /signal: AbortSignal\.timeout\(ORDER_CALL_TIMEOUT_MS\)/);
  assert.match(src, /saveDraft\(storage, assignmentId, unsentItems\(p\)\);/);
  assert.match(src, /clearDraft\(storage, assignmentId\);/);
  assert.match(src, /if \(counts\.notStarted === 0\) router\.push\(orderStartedHref\(assignmentId, counts\.started\)\);/);
  assert.match(src, /const keys = useRef\(new CallKeys\(\)\);/);
  assert.match(src, /role="status" aria-live="polite"/);
});

test("knappene paa de nye sidene er minst 44 px (Button, ButtonLink og ikonknappene)", () => {
  const card = withoutComments(read("components/ordre/ImageCard.tsx"));
  assert.match(card, /const ICON_BUTTON = `inline-flex size-11 /);
  assert.match(card, /const MENU_ITEM = `flex min-h-11 /);
  const board = withoutComments(read("components/ordre/ServiceBoard.tsx"));
  assert.match(board, /className=\{`flex w-full flex-col gap-2 rounded-button text-left/);
  // Merkelappene er 32 px, med trykkflate paa 44 px (after:).
  const badge = withoutComments(read("components/ordre/ServiceBadge.tsx"));
  assert.match(badge, /min-h-8 [^`]*after:absolute after:inset-x-0 after:-inset-y-1\.5/);
  assert.match(badge, /size-8 [^`]*after:absolute after:-inset-1\.5/);
  const sheet = withoutComments(read("components/ordre/ServiceSheet.tsx"));
  assert.match(sheet, /inline-flex size-11 shrink-0/);
});

// --- FE-3b: merkelappene, panelet og vinduet ------------------------------------------

const AB = ["a", "b"];
const stylingAB: SheetTarget = { kind: "images", service: "styling", imageIds: AB };
const target = (service: SheetTarget["service"], imageIds: readonly string[] = AB): SheetTarget => ({
  kind: "images",
  service,
  imageIds,
});
const style = (s: PanelState["styling"]["styles"]): PanelState => ({ ...PANEL, styling: { ...PANEL.styling, styles: s } });

test("merkelappene: kort navn og valget, nb og en", () => {
  const [dusk] = addChoices([], ["a"], panelChoices("skumring", PANEL)!);
  assert.equal(badgeLabel("nb", dusk), `Kveldsbilde · ${codeText("nb", "duskStyle", "warm_dusk_v3")}`);
  const [japandi] = addChoices([], ["a"], panelChoices("styling", PANEL)!);
  assert.equal(badgeLabel("nb", japandi), "Styling · Japandi");
  assert.equal(badgeLabel("en", japandi), "Styling · Japandi");
  const [hoest] = addChoices([], ["a"], panelChoices("aarstid", PANEL)!);
  assert.equal(badgeLabel("nb", hoest), "Årstid · Høst");
  assert.equal(badgeLabel("en", hoest), "Season · Autumn");
  const [sky] = addChoices([], ["a"], panelChoices("klart_vaer", PANEL)!);
  assert.equal(badgeLabel("nb", sky), "Blå himmel");
  const [faces] = addChoices([], ["a"], panelChoices("skjul_ansikter", PANEL)!);
  assert.equal(badgeLabel("nb", faces), "Skjul ansikter");
  assert.equal(badgeLabel("en", faces), "Hide faces");
});

test("merkelappen: × fjerner bare det ene elementet (samme stil paa et annet bilde og en annen stil staar)", () => {
  const items = addChoices([], AB, panelChoices("styling", PANEL)!);
  assert.equal(items.length, 4);
  const japandiA = items.find((i) => i.imageId === "a" && i.option === "styling_japandi")!;
  const next = removeItem(items, itemKey(japandiA));
  assert.equal(next.length, 3);
  assert.deepEqual(
    next.map((i) => `${i.imageId}:${i.option}`),
    ["b:styling_japandi", "a:styling_funkis", "b:styling_funkis"]
  );
});

test("panelet: status per tjeneste («Ikke lagt til», «På 1 av 2», «På alle 2», «Lagt til») og knappen", () => {
  const none = serviceRow("nb", [], [], "skumring");
  assert.equal(none.status, null);
  assert.equal(none.action, "add");
  const empty = serviceRow("nb", [], AB, "skumring");
  assert.equal(empty.status, "Ikke lagt til");
  assert.equal(empty.action, "add");
  const one = addChoices([], ["a"], panelChoices("skumring", PANEL)!);
  const some = serviceRow("nb", one, AB, "skumring");
  assert.equal(some.status, "På 1 av 2");
  assert.equal(some.coverage, "some");
  assert.equal(some.action, "edit");
  assert.equal(serviceRow("en", one, AB, "skumring").status, "On 1 of 2");
  const both = addChoices([], AB, panelChoices("skumring", PANEL)!);
  assert.equal(serviceRow("nb", both, AB, "skumring").status, "På alle 2");
  assert.equal(serviceRow("nb", both, ["a"], "skumring").status, "Lagt til");
  assert.equal(serviceRow("nb", both, AB, "styling").status, "Ikke lagt til");
  assert.equal(t("nb", "board.rowAdd"), "Legg til …");
  assert.equal(t("nb", "board.rowEdit"), "Endre …");
  assert.equal(t("nb", "board.selectedMany", { n: 2 }), "2 bilder valgt");
  assert.equal(t("nb", "board.selectFirst"), "Kryss av ett eller flere bilder.");
});

test("«Ulike … nå»: ulike valg paa bildene vises i raden, og vinduet forhaandsvelger ingenting", () => {
  let items = addChoices([], ["a"], panelChoices("styling", style(["styling_japandi"]))!);
  items = addChoices(items, ["b"], panelChoices("styling", style(["styling_sekelskifte"]))!);
  assert.equal(serviceRow("nb", items, AB, "styling").mixed, "Ulike stiler nå: Japandi, Sekelskifte");
  assert.equal(mixedText("en", items, AB, "styling"), "Different styles now: Japandi, Turn of the century");
  const start = sheetStart(items, stylingAB, PANEL);
  assert.equal(start.mode, "edit");
  assert.equal(start.mixed, true);
  assert.deepEqual(start.panel.styling, EMPTY_STYLING);
  assert.equal(panelChoices("styling", start.panel), null);
  // Bare ett av bildene avkrysset: ingen forskjell.
  assert.equal(serviceRow("nb", items, ["a"], "styling").mixed, null);
  // Samme stiler, ulik romtype: «Ulike valg».
  let rooms = addChoices([], ["a"], panelChoices("styling", PANEL)!);
  rooms = addChoices(rooms, ["b"], panelChoices("styling", { ...PANEL, styling: { ...PANEL.styling, furnishAs: "bedroom" } })!);
  assert.equal(mixedText("nb", rooms, AB, "styling"), "Ulike valg på bildene nå");
  // Kveldsbilde med ulik stemning: ingen stemning valgt, «Oppdater» er av til megleren velger.
  let dusk = addChoices([], ["a"], panelChoices("skumring", PANEL)!);
  dusk = addChoices(dusk, ["b"], panelChoices("skumring", { ...PANEL, dusk: { style: "nordic_blue_hour_v2", sky: "clear" } })!);
  const duskStart = sheetStart(dusk, target("skumring"), PANEL);
  assert.equal(duskStart.mixed, true);
  assert.equal(duskStart.panel.dusk, null);
  assert.equal(panelChoices("skumring", duskStart.panel), null);
  assert.equal(t("nb", "board.missingDusk"), "Velg en stemning.");
  assert.match(mixedText("nb", dusk, AB, "skumring")!, /^Ulike stemninger nå: /);
  // Aarstider.
  let seasons = addChoices([], ["a"], panelChoices("aarstid", PANEL)!);
  seasons = addChoices(seasons, ["b"], panelChoices("aarstid", { ...PANEL, aarstid: { source: "sommer", seasons: ["vaar"] } })!);
  assert.equal(mixedText("nb", seasons, AB, "aarstid"), "Ulike årstider nå: Høst, Vinter, Vår");
});

test("vinduet: like valg paa bildene forhaandsvelges; ingen har tjenesten gir «Legg til» med det som ble valgt sist", () => {
  const items = addChoices([], AB, panelChoices("styling", PANEL)!);
  const start = sheetStart(items, stylingAB, EMPTY_PANEL);
  assert.equal(start.mode, "edit");
  assert.equal(start.mixed, false);
  assert.deepEqual(start.panel.styling, { ...PANEL.styling, wishes: "Et stort teppe", styles: ["styling_japandi", "styling_funkis"] });
  const add = sheetStart([], stylingAB, PANEL);
  assert.equal(add.mode, "add");
  assert.deepEqual(add.panel, panelForNewSelection(PANEL));
  const season = sheetStart(addChoices([], AB, panelChoices("aarstid", PANEL)!), target("aarstid"), EMPTY_PANEL);
  assert.deepEqual(season.panel.aarstid, { source: "sommer", seasons: ["hoest", "vinter"] });
  // Merkelappen: valgene fra det ene elementet.
  const japandi = items.find((i) => i.imageId === "b" && i.option === "styling_japandi")!;
  const one = sheetStart(items, { kind: "item", service: "styling", imageId: "b", key: itemKey(japandi) }, EMPTY_PANEL);
  assert.equal(one.mode, "edit");
  assert.deepEqual(one.panel.styling.styles, ["styling_japandi"]);
  const texts = (mode: "add" | "edit", total: number, has: number) =>
    sheetButtons("nb", mode, total, has).map((b) => `${b.action}:${b.text}`);
  assert.deepEqual(texts("add", 2, 0), ["add:Legg til på 2 bilder"]);
  assert.deepEqual(texts("add", 1, 0), ["add:Legg til på bildet"]);
  assert.deepEqual(texts("edit", 2, 2), ["update:Oppdater 2 bilder"]);
  assert.deepEqual(texts("edit", 1, 1), ["update:Oppdater bildet"]);
  // Delvis (Petter 30.10): to knapper, Oppdater roerer bare de som har den.
  assert.deepEqual(texts("edit", 3, 2), ["update:Oppdater de 2 som har den", "add:Legg til på alle 3"]);
  assert.deepEqual(texts("edit", 2, 1), ["update:Oppdater bildet som har den", "add:Legg til på alle 2"]);
  assert.deepEqual(
    sheetButtons("en", "edit", 3, 2).map((b) => b.text),
    ["Update the 2 that have it", "Add to all 3"]
  );
  // Den dempede «Fjern»: bare naar noen har tjenesten.
  assert.equal(removeText("nb", 2, 0), null);
  assert.equal(removeText("nb", 2, 2), "Fjern fra de 2 bildene");
  assert.equal(removeText("nb", 3, 2), "Fjern fra de 2 bildene");
  assert.equal(removeText("nb", 1, 1), "Fjern fra bildet");
  assert.equal(removeText("nb", 2, 1), "Fjern fra bildet som har den");
});

test("vinduet gir de samme items som panelet i FE-3, for alle fem tjenestene", () => {
  const before = addChoices([], ["c"], panelChoices("skjul_ansikter", PANEL)!);
  for (const service of BOARD_SERVICES) {
    const tgt = target(service);
    const start = sheetStart(before, tgt, PANEL);
    assert.equal(start.mode, "add", service);
    const viaSheet = applySheet(before, tgt, "add", PANEL);
    assert.deepEqual(viaSheet, addChoices(before, AB, panelChoices(service, PANEL)!), service);
    assert.deepEqual(viaSheet!.map(toWire), [...before, ...addChoices([], AB, panelChoices(service, PANEL)!)].map(toWire), service);
  }
});

test("vinduet: «Oppdater» bytter tjenesten paa alle bildene i maalet; merkelappen bytter bare sitt element", () => {
  let items = addChoices([], ["a"], panelChoices("styling", style(["styling_japandi"]))!);
  items = addChoices(items, ["b"], panelChoices("styling", style(["styling_sekelskifte"]))!);
  items = addChoices(items, AB, panelChoices("skumring", PANEL)!);
  const next = applySheet(items, stylingAB, "update", style(["styling_funkis"]))!;
  assert.deepEqual(
    next.filter((i) => i.service === "styling").map((i) => `${i.imageId}:${i.option}`),
    ["a:styling_funkis", "b:styling_funkis"]
  );
  assert.equal(next.filter((i) => i.service === "skumring").length, 2);
  // Ufullstendig valg: ingen endring.
  assert.equal(applySheet(items, stylingAB, "update", { ...PANEL, styling: EMPTY_STYLING }), null);
  // Merkelappen: som «Endre» i FE-3 (replaceItem).
  const sek = items.find((i) => i.option === "styling_sekelskifte")!;
  const tgt: SheetTarget = { kind: "item", service: "styling", imageId: "b", key: itemKey(sek) };
  const panel = style(["styling_funkis"]);
  assert.deepEqual(applySheet(items, tgt, "update", panel), replaceItem(items, itemKey(sek), panelChoices("styling", panel)!));
});

test("vinduet, delvis: «Oppdater» roerer bare bildene som har tjenesten; «Legg til på alle» som FE-3", () => {
  const abc = ["a", "b", "c"];
  const tgt = target("styling", abc);
  const items = addChoices([], AB, panelChoices("styling", style(["styling_japandi"]))!);
  const start = sheetStart(items, tgt, EMPTY_PANEL);
  assert.equal(start.mode, "edit");
  assert.deepEqual(start.panel.styling.styles, ["styling_japandi"]);
  const funkis = style(["styling_funkis"]);
  const updated = applySheet(items, tgt, "update", funkis)!;
  assert.deepEqual(
    updated.map((i) => `${i.imageId}:${i.option}`),
    ["a:styling_funkis", "b:styling_funkis"]
  );
  const added = applySheet(items, tgt, "add", funkis)!;
  assert.deepEqual(added, addChoices(items, abc, panelChoices("styling", funkis)!));
  assert.deepEqual(
    added.map((i) => `${i.imageId}:${i.option}`),
    ["a:styling_japandi", "b:styling_japandi", "a:styling_funkis", "b:styling_funkis", "c:styling_funkis"]
  );
  // Samme valg som de har: «Legg til på alle» gir bare det tredje bildet, ingen dubletter.
  const same = applySheet(items, tgt, "add", start.panel)!;
  assert.equal(same.length, 3);
  assert.equal(same[2].imageId, "c");
});

test("vinduet: «Fjern» tar tjenesten av bildene i maalet, eller bare elementet for merkelappen", () => {
  let items = addChoices([], AB, panelChoices("styling", PANEL)!);
  items = addChoices(items, ["c"], panelChoices("styling", PANEL)!);
  items = addChoices(items, AB, panelChoices("skjul_ansikter", PANEL)!);
  const left = removeSheet(items, target("styling"));
  assert.deepEqual(
    left.map((i) => `${i.imageId}:${i.service}`),
    ["c:styling", "c:styling", "a:skjul_ansikter", "b:skjul_ansikter"]
  );
  const japandiA = items.find((i) => i.imageId === "a" && i.option === "styling_japandi")!;
  const one = removeSheet(items, { kind: "item", service: "styling", imageId: "a", key: itemKey(japandiA) });
  assert.deepEqual(one, removeItem(items, itemKey(japandiA)));
  const sheet = withoutComments(read("components/ordre/ServiceSheet.tsx"));
  // Dempet, men 44 px hoey, og bare naar noen har tjenesten.
  assert.match(sheet, /\{remove !== null && \(\s*<button\s+type="button"\s+onClick=\{onRemove\}\s+className=\{`ml-auto inline-flex min-h-11 [^`]*text-ink-2 underline/);
  assert.match(sheet, /variant=\{i === 0 \? "primary" : "secondary"\}/);
});

test("aarstider er for utebilder: rom-navn som tyder paa inne, og bilder merket «Innendørs», faar advarsel", () => {
  for (const room of ["Stue", "Hovedsoverom", "Gang", "Bad 2", "Kjøkken/stue", "TV-stue", "Tomt rom", "Innerom", "Living room"]) {
    assert.equal(looksIndoor(room), true, room);
  }
  for (const room of ["Fasade", "Hage", "Terrasse", "Uterom", "Uteplass", "Inngangsparti", "Balkong", "Utsikt", null]) {
    assert.equal(looksIndoor(room), false, String(room));
  }
  const imgs = [image("a", 1, { room: "Fasade" }), image("b", 2, { room: "Stue" }), image("c", 3, { room: "Hage" })];
  const marked = addChoices([], ["c"], panelChoices("skumring", { ...PANEL, duskImageType: "interior" })!);
  assert.deepEqual(
    indoorImages(imgs, marked, ["a", "b", "c"]).map((i) => i.id),
    ["b", "c"]
  );
  assert.deepEqual(indoorImages(imgs, marked, ["a"]), []);
  assert.equal(
    t("nb", "board.sheet.indoor", { names: "2. Stue" }),
    "Ser ut til å være tatt innendørs: 2. Stue. Årstider virker bare på bilder tatt utendørs."
  );
  assert.equal(t("nb", "board.sheet.aarstidNote"), "Årstider er for bilder tatt utendørs: fasade, hage og balkong.");
  const sheet = withoutComments(read("components/ordre/ServiceSheet.tsx"));
  assert.match(sheet, /\{service === "aarstid" && <p [^>]*>\{t\(locale, "board\.sheet\.aarstidNote"\)\}<\/p>\}/);
  assert.match(sheet, /t\(locale, "board\.sheet\.indoor", \{ names: indoor \}\)/);
});
