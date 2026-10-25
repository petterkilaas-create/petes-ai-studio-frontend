import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AdditionItem, AdditionsCheck, AdditionsLevel, DecisionAction, LightBox } from "./api.ts";
import {
  additionMarkers,
  additionsList,
  additionsSentences,
  additionsView,
  additionTypeText,
  approveEnabled,
  canShowAdditions,
  joinList,
} from "./additions.ts";
import { blockedResult } from "./brightness.ts";
import { buildCorrection } from "./correction.ts";
import { DICTIONARIES, t } from "./i18n/index.ts";
import { buildDecision, sendAcknowledged } from "./review.ts";

// TG-NEW-199 PR 4 (Petter 12.10, V1 A, V2 A, V3 A): advarsel, merknad,
// «Ikke kontrollert», «Vis mulige tillegg» og krysset foer «Godkjenn».
// Kontrakten er backend #174 (a736f3e). Alt styres av `level`.

// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE (som i api.test.ts).
process.env.NEXT_PUBLIC_API_BASE ??= "http://api.test";
const { normalizeReview, parseDecisionResponse, toAdditionsCheck } = await import("./api.ts");

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
/** Uten kommentarer, saa en kommentar ikke kan oppfylle eller bryte en sjekk. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const item = (kind: AdditionItem["kind"], type: string | null, box: LightBox | null = null, location: string | null = null): AdditionItem => ({
  kind,
  type,
  box,
  confidence: "high",
  location,
});

const LEVELS: AdditionsLevel[] = ["warning", "note", "none", "unchecked"];
const ACTIONS: DecisionAction[] = ["approve", "reject", "continue", "correct"];

// ---------------------------------------------------------------------------
// Lesingen av svaret
// ---------------------------------------------------------------------------

test("TG199 PR4: additions_check leses fra kontrakten", () => {
  const check = toAdditionsCheck({
    status: "found",
    level: "warning",
    items: [
      { kind: "warning", type: "new_window", box: [100, 200, 300, 400], confidence: "high", location: "Left of the door" },
      { kind: "note", type: "changed_lamp", box: null, confidence: "low", location: "Ceiling lamp" },
    ],
  });
  assert.deepEqual(check, {
    status: "found",
    level: "warning",
    items: [
      { kind: "warning", type: "new_window", box: [100, 200, 300, 400], confidence: "high", location: "Left of the door" },
      { kind: "note", type: "changed_lamp", box: null, confidence: "low", location: "Ceiling lamp" },
    ],
  });
});

test("TG199 PR4: manglende, ugyldig eller ukjent nivå blir unchecked", () => {
  const unchecked = { status: null, level: "unchecked", items: [] };
  for (const raw of [undefined, null, "warning", [], 3]) assert.deepEqual(toAdditionsCheck(raw), unchecked, String(raw));
  assert.equal(toAdditionsCheck({ status: "found", level: "danger", items: [] }).level, "unchecked");
  assert.equal(toAdditionsCheck({ status: "ok", level: 1 }).level, "unchecked");
  for (const level of LEVELS) assert.equal(toAdditionsCheck({ level }).level, level);
  // Gamle svar og svar uten feltet: normalizeReview gir unchecked.
  assert.deepEqual(normalizeReview({}, "j1").additionsCheck, unchecked);
  assert.equal(normalizeReview({ additions_check: { status: "not_run", level: "unchecked", items: [] } }, "j1").additionsCheck.status, "not_run");
});

test("TG199 PR4: poster leses strengt (ukjent kind hoppes over, ugyldig boks blir null)", () => {
  const check = toAdditionsCheck({
    level: "note",
    items: [
      { kind: "danger", type: "new_window", box: [0, 0, 10, 10] },
      "tekst",
      { kind: "note", type: 5, box: [0, 0, 10, 1001], location: 7 },
      { kind: "note", type: "new_lamp", box: [1, 2, 3] },
      { kind: "warning", type: "new_door", box: [0.5, 0, 10, 10] },
    ],
  });
  assert.deepEqual(check.items, [
    { kind: "note", type: null, box: null, confidence: null, location: null },
    { kind: "note", type: "new_lamp", box: null, confidence: null, location: null },
    { kind: "warning", type: "new_door", box: null, confidence: null, location: null },
  ]);
  assert.deepEqual(toAdditionsCheck({ level: "warning", items: "x" }).items, []);
});

// ---------------------------------------------------------------------------
// Nivået
// ---------------------------------------------------------------------------

test("TG199 PR4: nivået styrer linja, krysset og «Vis mulige tillegg»", () => {
  assert.deepEqual(additionsView("warning"), { notice: "warning", needsAck: true, showBoxes: true });
  assert.deepEqual(additionsView("note"), { notice: "note", needsAck: false, showBoxes: true });
  assert.deepEqual(additionsView("unchecked"), { notice: "unchecked", needsAck: false, showBoxes: false });
  assert.deepEqual(additionsView("none"), { notice: null, needsAck: false, showBoxes: false });
  assert.deepEqual(additionsView("danger" as AdditionsLevel), additionsView("unchecked"));
});

// D-5a (Petter 25.10, §3 b): ett kryss for alle nivaaer. Ved advarsel
// setter krysset ogsaa acknowledged, og det kreves fortsatt.
test("TG199 PR4 og D-5a: «Godkjenn» er av til krysset er satt, for alle nivåer", () => {
  assert.equal(approveEnabled("warning", false, false), false);
  assert.equal(approveEnabled("warning", true, false), false, "advarsel uten acknowledged");
  assert.equal(approveEnabled("warning", false, true), false);
  assert.equal(approveEnabled("warning", true, true), true);
  for (const level of ["note", "none", "unchecked", "danger" as AdditionsLevel] as AdditionsLevel[]) {
    assert.equal(approveEnabled(level, false, false), false, level);
    assert.equal(approveEnabled(level, false, true), false, level);
    assert.equal(approveEnabled(level, true, false), true, level);
    assert.equal(approveEnabled(level, true, true), true, level);
  }
});

// ---------------------------------------------------------------------------
// Lista og setningene
// ---------------------------------------------------------------------------

test("TG199 PR4: typene i entall og flertall på norsk og engelsk", () => {
  const nb: [string, string, string][] = [
    ["new_window", "nytt vindu", "2 nye vinduer"],
    ["glass_in_door", "glass i dør", "glass i 2 dører"],
    ["new_door", "ny dør", "2 nye dører"],
    ["new_lamp", "ny lampe", "2 nye lamper"],
    ["new_opening", "ny åpning", "2 nye åpninger"],
    ["other_structure", "annen endring i bygget", "2 andre endringer i bygget"],
    ["changed_lamp", "endret lampe", "2 endrede lamper"],
    ["light_through_opening", "lys gjennom åpning", "lys gjennom 2 åpninger"],
  ];
  for (const [type, one, two] of nb) {
    assert.equal(additionTypeText("nb", type, 1), one);
    assert.equal(additionTypeText("nb", type, 2), two);
  }
  assert.equal(additionTypeText("en", "new_window", 1), "new window");
  assert.equal(additionTypeText("en", "glass_in_door", 3), "glass in 3 doors");
  assert.equal(additionTypeText("en", "light_through_opening", 2), "light through 2 openings");
  // Ukjent type, null og prototypen: «annen endring».
  for (const type of ["roof", null, "__proto__", "toString"]) {
    assert.equal(additionTypeText("nb", type, 1), "annen endring");
    assert.equal(additionTypeText("nb", type, 4), "4 andre endringer");
    assert.equal(additionTypeText("en", type, 1), "other change");
  }
  // Samme koder i entall og flertall, og i begge språk.
  for (const dict of [DICTIONARIES.nb, DICTIONARIES.en]) {
    assert.deepEqual(Object.keys(dict.codes.additionTypePlural), Object.keys(dict.codes.additionType));
    for (const text of Object.values(dict.codes.additionTypePlural)) assert.match(text, /\{n\}/);
  }
});

test("TG199 PR4: lista uten dubletter, med antall, i rekkefølgen fra backend", () => {
  const items = [
    item("warning", "new_window"),
    item("note", "changed_lamp"),
    item("warning", "glass_in_door"),
    item("warning", "new_window"),
    item("warning", "roof"),
    item("warning", "chimney"),
  ];
  assert.equal(additionsList("nb", items, "warning"), "2 nye vinduer, glass i dør og 2 andre endringer");
  assert.equal(additionsList("en", items, "warning"), "2 new windows, glass in door and 2 other changes");
  assert.equal(additionsList("nb", items, "note"), "endret lampe");
  assert.equal(additionsList("nb", [item("warning", "new_door")], "note"), null);
  assert.equal(additionsList("nb", [], "warning"), null);
  assert.equal(joinList("nb", []), "");
  assert.equal(joinList("nb", ["a"]), "a");
  assert.equal(joinList("nb", ["a", "b"]), "a og b");
  assert.equal(joinList("en", ["a", "b", "c"]), "a, b and c");
});

test("TG199 PR4: setningene ved advarsel og merknad (V2 A)", () => {
  const both = { level: "warning" as const, items: [item("warning", "new_window"), item("note", "changed_lamp")] };
  assert.deepEqual(additionsSentences("nb", both), {
    warning: "Kontrollen fant mulige tillegg: nytt vindu. Se markeringene i bildet.",
    note: "Kontrollen fant noe du bør se på: endret lampe.",
  });
  assert.deepEqual(additionsSentences("en", { level: "warning", items: [item("warning", "new_window")] }), {
    warning: "The check found possible additions: new window. See the markings in the image.",
    note: null,
  });
  assert.deepEqual(additionsSentences("nb", { level: "note", items: [item("note", "light_through_opening")] }), {
    warning: null,
    note: "Kontrollen fant noe du bør se på: lys gjennom åpning.",
  });
  // Nivå uten poster: setningen blir aldri tom.
  assert.equal(additionsSentences("nb", { level: "warning", items: [] }).warning, "Kontrollen fant mulige tillegg: annen endring. Se markeringene i bildet.");
  assert.equal(additionsSentences("nb", { level: "note", items: [] }).note, "Kontrollen fant noe du bør se på: annen endring.");
  for (const level of ["none", "unchecked"] as const) {
    assert.deepEqual(additionsSentences("nb", { level, items: both.items }), { warning: null, note: null });
  }
});

test("TG199 PR4: tekstene på norsk og engelsk", () => {
  assert.equal(t("nb", "additions.unchecked"), "Ikke kontrollert automatisk.");
  assert.equal(t("en", "additions.unchecked"), "Not checked automatically.");
  // D-5a: «additions.ack» er erstattet av krysset «checklist.comparedWarning» (checklist.test.ts).
  assert.ok(!Object.hasOwn(DICTIONARIES.nb.ui, "additions.ack"));
  assert.ok(!Object.hasOwn(DICTIONARIES.en.ui, "additions.ack"));
  assert.equal(t("nb", "additions.show"), "Vis mulige tillegg");
  assert.equal(t("en", "additions.show"), "Show possible additions");
  assert.equal(
    DICTIONARIES.nb.codes.decisionError.additions_not_acknowledged,
    "Kryss av for at du har sjekket de markerte stedene, og godkjenn på nytt."
  );
  assert.equal(
    DICTIONARIES.en.codes.decisionError.additions_not_acknowledged,
    "Tick the box to confirm you have checked the marked places, then approve again."
  );
});

// ---------------------------------------------------------------------------
// Boksene
// ---------------------------------------------------------------------------

test("TG199 PR4: boksene nummereres 1, 2, 3 bare når de har boks, i prosent av resultatbildet", () => {
  const items = [
    item("warning", "new_window", [100, 200, 300, 400]),
    item("note", "changed_lamp"),
    item("note", "new_lamp", [600, 800, 500, 700]),
  ];
  const { markers, withoutBox } = additionMarkers(items);
  assert.deepEqual(
    markers.map((m) => ({ n: m.number, kind: m.item.kind, x: m.x, y: m.y, w: m.width, h: m.height })),
    [
      { n: 1, kind: "warning", x: 30, y: 20, w: 20, h: 20 },
      // Snudd boks normaliseres.
      { n: 2, kind: "note", x: 75, y: 55, w: 10, h: 10 },
    ]
  );
  assert.deepEqual(withoutBox, [items[1]]);
  assert.deepEqual(additionMarkers([]), { markers: [], withoutBox: [] });
});

test("TG199 PR4: «Vis mulige tillegg» bare ved advarsel og merknad, med poster og forhåndsvisning", () => {
  const review = (level: AdditionsLevel, opts: { items?: AdditionItem[]; previewUrl?: string | null; deleted?: string | null } = {}) => ({
    additionsCheck: { status: "found", level, items: opts.items ?? [item("warning", "new_window")] } as AdditionsCheck,
    images: { previewUrl: opts.previewUrl === undefined ? "https://x/p.jpg" : opts.previewUrl } as never,
    mediaDeletedAt: opts.deleted ?? null,
  });
  assert.equal(canShowAdditions(review("warning")), true);
  assert.equal(canShowAdditions(review("note")), true);
  assert.equal(canShowAdditions(review("none")), false);
  assert.equal(canShowAdditions(review("unchecked")), false);
  assert.equal(canShowAdditions(review("warning", { items: [] })), false);
  assert.equal(canShowAdditions(review("warning", { previewUrl: null })), false);
  assert.equal(canShowAdditions(review("warning", { deleted: "2026-10-12T10:00:00Z" })), false);
});

// ---------------------------------------------------------------------------
// Det som sendes
// ---------------------------------------------------------------------------

test("TG199 PR4: additions_acknowledged sendes bare ved approve, warning og kryss", () => {
  for (const action of ACTIONS) {
    for (const level of LEVELS) {
      for (const ack of [false, true]) {
        const expected = action === "approve" && level === "warning" && ack;
        assert.equal(sendAcknowledged(action, level, ack), expected, `${action}/${level}/${ack}`);
        const review = { version: 3, additionsCheck: { status: "found", level, items: [] } };
        const body = buildDecision(action, "", "yes", review, null, ack);
        assert.equal(Object.hasOwn(body, "additions_acknowledged"), expected, `${action}/${level}/${ack}`);
        if (expected) assert.equal(body.additions_acknowledged, true);
      }
    }
  }
  assert.deepEqual(
    buildDecision("approve", "", null, { version: 3, additionsCheck: { status: "found", level: "warning", items: [] } }, 0, true),
    { action: "approve", expected_version: 3, brightness_step: 0, additions_acknowledged: true }
  );
  // Uten kontroll i review (eldre kall) og uten kryss: samme body som før.
  assert.deepEqual(buildDecision("approve", "", null, { version: 3 }, null), { action: "approve", expected_version: 3 });
  assert.deepEqual(buildDecision("approve", "", null, { version: 3 }, null, true), { action: "approve", expected_version: 3 });
});

test("TG199 PR4: «Korriger bildet» sender aldri feltet", () => {
  const review = normalizeReview(
    { version: 2, allowed_actions: ["approve", "correct"], additions_check: { status: "found", level: "warning", items: [] } },
    "j1"
  );
  const body = buildCorrection(review, {}, false, null);
  assert.equal(body.action, "correct");
  assert.equal(Object.hasOwn(body, "additions_acknowledged"), false);
});

test("TG199 PR4: 409 additions_not_acknowledged henter på nytt og låser ikke", () => {
  const out = parseDecisionResponse(409, { detail: { code: "additions_not_acknowledged", level: "warning", warnings: 2 } });
  assert.equal(out.kind, "blocked");
  if (out.kind !== "blocked") return;
  assert.deepEqual(blockedResult(out), {
    message: { group: "decisionError", code: "additions_not_acknowledged" },
    block: false,
    refetch: true,
  });
  // Andre 409 låser som før.
  assert.equal(blockedResult({ kind: "blocked", code: "action_not_allowed", fields: [], overrideCode: null }).block, true);
});

// ---------------------------------------------------------------------------
// Kortet, visningen og siden
// ---------------------------------------------------------------------------

const card = code("components/godkjenning/DecisionCard.tsx");
const markersSrc = code("components/godkjenning/AdditionMarkers.tsx");
const viewer = code("components/godkjenning/CompareViewer.tsx");
const page = code("(app)/godkjenning/[jobId]/page.tsx");

test("TG199 PR4: i kortet står linja, sjekklista og krysset over knappene, bare med «Godkjenn» og ikke i rettingen", () => {
  const block = card.indexOf("{controls.approve && (\n            <div");
  const blockEnd = card.indexOf("</div>\n          )}", block);
  const otherwise = card.indexOf(") : (", card.indexOf("correction !== null ? ("));
  const buttons = card.indexOf('<div className="flex flex-wrap gap-3">');
  const at = (s: string) => card.indexOf(s);
  const warning = at('view.notice === "warning"');
  const note = at('view.notice === "note"');
  const unchecked = at('view.notice === "unchecked"');
  const checklist = at("CHECKLISTS[checklist]");
  const ack = at("checked={compared}");
  assert.ok(otherwise !== -1 && block > otherwise, "blokka er i grenen uten retting");
  for (const [name, i] of Object.entries({ warning, note, unchecked, checklist, ack })) {
    assert.ok(i > block && i < blockEnd, `${name} er i controls.approve-blokka`);
  }
  assert.ok(blockEnd < buttons, "blokka står før knappene");
  // Sjekklista under advarselen og merknaden, krysset under sjekklista (D-5a: ett kryss).
  assert.ok(warning < checklist && note < checklist && unchecked < checklist && checklist < ack);
  assert.equal(card.match(/type="checkbox"/g)?.length, 1);
  assert.doesNotMatch(card, /"additions\.ack"/);
});

test("TG199 PR4 og D-5a: krysset er en ekte checkbox med label, og advarselen kunngjøres", () => {
  // D-5a: ett kryss. Ved advarsel setter det ogsaa acknowledged.
  assert.match(
    card,
    /<label className="[^"]*min-h-11[^"]*">\s*<input\s+type="checkbox"\s+checked=\{compared\}\s+disabled=\{locked\}\s+onChange=\{\(e\) => \{\s*onCompared\(e\.target\.checked\);\s*if \(view\.needsAck\) onAcknowledged\(e\.target\.checked\);\s*\}\}[\s\S]*?\/>\s*<span>\{t\(locale, comparedKey\(additions\.level\)\)\}<\/span>\s*<\/label>/
  );
  assert.match(card, /view\.notice === "warning" && \(\s*<div className="[^"]*text-red-fg bg-red-bg[^"]*" role="alert">/);
  assert.match(card, /view\.notice === "note" && \(\s*<p className="[^"]*text-amber-fg bg-amber-bg[^"]*" role="status">/);
  assert.match(card, /view\.notice === "unchecked" && \(\s*<p className="text-sm text-ink-2" role="status">/);
  assert.match(card, /disabled=\{locked \|\| !approveEnabled\(additions\.level, compared, acknowledged\)\}/);
});

test("TG199 PR4: boksene på gjeldende rundes forhåndsvisning, plasseringen bare for admin", () => {
  assert.match(
    page,
    /additionsView=\{\s*canShowAdditions\(review\) && review\.images\.previewUrl !== null \? \(\s*<AdditionMarkers\s+url=\{review\.images\.previewUrl\}\s+items=\{review\.additionsCheck\.items\}\s+admin=\{admin\}\s+locale=\{locale\}\s*\/>\s*\) : null\s*\}/
  );
  assert.equal(page.match(/<AdditionMarkers\s/g)?.length, 1);
  // Naturlig sideforhold, prosent fra midtpunktet, laget skjult for skjermlesere.
  assert.match(markersSrc, /<img src=\{url\} alt=\{t\(locale, "review\.result"\)\} className="block w-full h-auto" \/>/);
  assert.doesNotMatch(markersSrc, /object-(cover|contain)/);
  assert.match(markersSrc, /left: `\$\{m\.x\}%`, top: `\$\{m\.y\}%`/);
  assert.match(markersSrc, /<div aria-hidden="true" className="pointer-events-none absolute inset-0">/);
  // `location` bare bak admin.
  assert.deepEqual(markersSrc.match(/[^\n]*\.location\b[^\n]*/g)?.map((l) => l.trim()), [
    "return [additionTypeText(locale, item.type, 1), kind, admin ? item.location : null]",
  ]);
  // Knappen i CompareViewer, og visningene utelukker hverandre.
  assert.match(viewer, /aria-pressed=\{showAdditions\}/);
  assert.match(viewer, /t\(locale, "additions\.show"\)/);
  assert.match(viewer, /const toggle = \(o: Exclude<Overlay, null>\) => setOverlay\(overlay === o \? null : o\);/);
});

test("TG199 PR4: krysset nullstilles ved ny henting og sendes med godkjenningen", () => {
  const fetch = page.slice(page.indexOf("const fetchReview"), page.indexOf("useEffect("));
  assert.match(fetch, /setAcknowledged\(false\);/);
  assert.match(page, /acknowledged=\{acknowledged\}\s+onAcknowledged=\{setAcknowledged\}/);
  assert.match(page, /additions=\{review\.additionsCheck\}/);
  // Ingen tekst skrevet rett inn.
  for (const src of [page, card, markersSrc, viewer]) {
    for (const text of ["Ikke kontrollert", "Vis mulige tillegg", "Jeg har sjekket", "Kontrollen fant"]) {
      assert.ok(!src.includes(text), text);
    }
  }
});
