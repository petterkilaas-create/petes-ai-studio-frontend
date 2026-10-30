import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  approvalNow,
  draftCount,
  fillPercent,
  mobileNextText,
  mobileStepText,
  OneAtATime,
  orderProgress,
  pageStep,
  readLastStep,
  saveLastStep,
  stepAria,
  stepMemoryKey,
  stepSub,
  type OrderPage,
  type OrderProgressView,
  type ProgressCounts,
} from "./orderProgress.ts";
import { saveDraft, type DraftStorage } from "./board.ts";
import { DICTIONARIES, t } from "./i18n/index.ts";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

/**
 * Fremdriftslinja (Dag 59, FREMDRIFT): stegene og lenkene per side, foer og
 * etter start, undertekstene, minnet for fyllet, vernet mot dobbel start,
 * og kildeteksten til linja og sidene (node --test kan ikke laste .tsx).
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const ID = "asg_1";
const counts = (over: Partial<ProgressCounts> = {}): ProgressCounts => ({
  images: 3,
  results: 0,
  processing: 0,
  toReview: 0,
  needsAnswer: 0,
  ...over,
});

function view(page: OrderPage, c: ProgressCounts | null, draft = 0): OrderProgressView {
  return orderProgress(page, c === null ? null : { id: ID, counts: c }, draft);
}
const states = (v: OrderProgressView) => v.steps.map((s) => s.state);
const hrefs = (v: OrderProgressView) => v.steps.map((s) => s.href);

// --- orderProgress ------------------------------------------------------------------------

test("steget per side: bildesiden er steg 1 foer start og steg 4 med resultater", () => {
  assert.equal(pageStep("new", null), 1);
  assert.equal(pageStep("images", { results: 0 }), 1);
  assert.equal(pageStep("images", { results: 1 }), 4);
  assert.equal(pageStep("services", { results: 5 }), 2);
  assert.equal(pageStep("check", null), 3);
  assert.equal(pageStep("player", { results: 0 }), 4);
  assert.equal(pageStep("delivery", { results: 0 }), 5);
});

test("ny ordre: steg 1, ingen lenker og ingen «Tilbake»", () => {
  const v = view("new", null);
  assert.equal(v.current, 1);
  assert.deepEqual(states(v), ["current", "todo", "todo", "todo", "todo"]);
  assert.deepEqual(hrefs(v), [null, null, null, null, null]);
  assert.equal(v.backHref, null);
});

test("bildesiden foer start: Tjenester er naadd med bilder, Kontroll bare med utkast", () => {
  const none = view("images", counts({ images: 0 }));
  assert.deepEqual(states(none), ["current", "todo", "todo", "todo", "todo"]);
  assert.deepEqual(hrefs(none), [null, null, null, null, null]);
  const some = view("images", counts());
  assert.deepEqual(states(some), ["current", "reached", "todo", "todo", "todo"]);
  assert.deepEqual(hrefs(some), [null, "/ordrer/asg_1/tjenester", null, null, null]);
  assert.equal(some.backHref, null);
  const draft = view("images", counts(), 2);
  assert.deepEqual(hrefs(draft), [null, "/ordrer/asg_1/tjenester", "/ordrer/asg_1/kontroll", null, null]);
});

test("bildesiden etter start: steg 4, Bilder er ferdig uten lenke til seg selv, «Tilbake» til Tjenester", () => {
  const v = view("images", counts({ results: 2 }));
  assert.equal(v.current, 4);
  assert.deepEqual(states(v), ["done", "done", "done", "current", "reached"]);
  // Kontroll er tom etter start (utkastet er toemt): ferdig, men ingen lenke (valg 1A).
  assert.deepEqual(hrefs(v), [null, "/ordrer/asg_1/tjenester", null, null, "/ordrer/asg_1/last-ned"]);
  assert.equal(v.backHref, "/ordrer/asg_1/tjenester");
});

test("brettet: «Tilbake» til bildene; med resultater er Godkjenning og Last ned naadde lenker", () => {
  const first = view("services", counts(), 0);
  assert.deepEqual(states(first), ["done", "current", "todo", "todo", "todo"]);
  assert.deepEqual(hrefs(first), ["/ordrer/asg_1/bilder", null, null, null, null]);
  assert.equal(first.backHref, "/ordrer/asg_1/bilder");
  // Tilbake til brettet for aa bestille mer: steg 4 og 5 er naadd, steg 3 naar utkastet har noe.
  const more = view("services", counts({ results: 4 }), 1);
  assert.deepEqual(states(more), ["done", "current", "reached", "reached", "reached"]);
  assert.deepEqual(hrefs(more), [
    "/ordrer/asg_1/bilder",
    null,
    "/ordrer/asg_1/kontroll",
    "/ordrer/asg_1",
    "/ordrer/asg_1/last-ned",
  ]);
  const emptyDraft = view("services", counts({ results: 4 }), 0);
  assert.deepEqual(states(emptyDraft), ["done", "current", "todo", "reached", "reached"]);
});

test("kontroll: steg 3, «Tilbake» til brettet, ogsaa med tomt utkast", () => {
  const v = view("check", counts(), 3);
  assert.equal(v.current, 3);
  assert.deepEqual(hrefs(v), ["/ordrer/asg_1/bilder", "/ordrer/asg_1/tjenester", null, null, null]);
  assert.equal(v.backHref, "/ordrer/asg_1/tjenester");
  const empty = view("check", counts(), 0);
  assert.deepEqual(states(empty), ["done", "done", "current", "todo", "todo"]);
  assert.equal(empty.backHref, "/ordrer/asg_1/tjenester");
});

test("spilleren: steg 4, «Tilbake» alltid til Tjenester (valg 1A), Kontroll-lenke bare med utkast", () => {
  const v = view("player", counts({ results: 3 }));
  assert.deepEqual(states(v), ["done", "done", "done", "current", "reached"]);
  assert.deepEqual(hrefs(v), ["/ordrer/asg_1/bilder", "/ordrer/asg_1/tjenester", null, null, "/ordrer/asg_1/last-ned"]);
  assert.equal(v.backHref, "/ordrer/asg_1/tjenester");
  const draft = view("player", counts({ results: 3 }), 2);
  assert.equal(draft.steps[2].href, "/ordrer/asg_1/kontroll");
  assert.equal(draft.backHref, "/ordrer/asg_1/tjenester");
});

test("last ned: steg 5, «Tilbake» til spilleren; uten resultater til naermeste naadde steg", () => {
  const v = view("delivery", counts({ results: 2 }));
  assert.deepEqual(states(v), ["done", "done", "done", "done", "current"]);
  assert.deepEqual(hrefs(v), ["/ordrer/asg_1/bilder", "/ordrer/asg_1/tjenester", null, "/ordrer/asg_1", null]);
  assert.equal(v.backHref, "/ordrer/asg_1");
  assert.equal(view("delivery", counts()).backHref, "/ordrer/asg_1/tjenester");
  assert.equal(view("delivery", counts(), 1).backHref, "/ordrer/asg_1/kontroll");
  assert.equal(view("delivery", counts({ images: 0 })).backHref, "/ordrer/asg_1/bilder");
});

test("lenker bare paa ferdige og naadde steg, aldri paa gjeldende eller graa", () => {
  const pages: OrderPage[] = ["images", "services", "check", "player", "delivery"];
  for (const page of pages) {
    for (const c of [counts({ images: 0 }), counts(), counts({ results: 2 })]) {
      for (const draft of [0, 2]) {
        const v = view(page, c, draft);
        assert.equal(v.steps.filter((s) => s.state === "current").length, 1);
        for (const s of v.steps) {
          if (s.state === "current" || s.state === "todo") assert.equal(s.href, null, `${page} ${s.n}`);
        }
      }
    }
  }
});

test("fyllet: fra steg 1 til gjeldende, i prosent", () => {
  assert.equal(fillPercent(1), 0);
  assert.equal(fillPercent(2), 25);
  assert.equal(fillPercent(3), 50);
  assert.equal(fillPercent(5), 100);
  assert.equal(fillPercent(9), 100);
  assert.equal(fillPercent(0), 0);
});

test("utkastet: antall elementer for bildene som finnes", () => {
  const store = new Map<string, string>();
  const storage: DraftStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
  assert.equal(draftCount(storage, ID, ["img_1"]), 0);
  saveDraft(storage, ID, [
    { imageId: "img_1", service: "skumring", option: null, sourceSeason: null },
    { imageId: "img_gone", service: "skumring", option: null, sourceSeason: null },
  ]);
  assert.equal(draftCount(storage, ID, ["img_1"]), 1);
  assert.equal(draftCount(null, ID, ["img_1"]), 0);
});

// --- tekst ---------------------------------------------------------------------------------

test("undertekstene: bare data siden har, ellers ingenting", () => {
  const c = counts({ images: 3, results: 6, processing: 2, toReview: 3, needsAnswer: 1 });
  const at = (page: OrderPage, servicesNow: string | null = null) => {
    const v = view(page, c);
    return v.steps.map((s) => stepSub("nb", s, v.current, c, servicesNow));
  };
  assert.deepEqual(at("services", "4 bearbeidinger"), ["3 bilder", "4 bearbeidinger", "Neste", null, null]);
  assert.deepEqual(at("check"), ["3 bilder", null, "Se over og start", "Neste", null]);
  assert.deepEqual(at("player"), ["3 bilder", null, null, "2 behandles · 3 til godkjenning · 1 trenger svar", "Neste"]);
  assert.deepEqual(at("delivery"), ["3 bilder", null, null, null, null]);
  const first = view("images", counts({ images: 1 }));
  assert.deepEqual(
    first.steps.map((s) => stepSub("nb", s, first.current, counts({ images: 1 }))),
    ["Last opp og velg rom", "Neste", null, null, null]
  );
  // Ny ordre: ingen tall.
  const fresh = view("new", null);
  assert.equal(stepSub("nb", fresh.steps[0], 1, null), "Last opp og velg rom");
  // Brettet uten totalsText: ingen undertekst.
  const board = view("services", c);
  assert.equal(stepSub("nb", board.steps[1], 2, c, null), null);
  assert.equal(approvalNow("nb", { processing: 0, toReview: 0, needsAnswer: 0 }), null);
  assert.equal(approvalNow("nb", { processing: 1, toReview: 0, needsAnswer: 0 }), "1 behandles");
});

test("skjermleser og mobil: «Bilder: ferdig», «Steg 2 av 5», «Neste: Kontroll», «Siste steg»", () => {
  const v = view("services", counts());
  assert.deepEqual(
    v.steps.map((s) => stepAria("nb", s)),
    ["Bilder: ferdig", "Tjenester: du er her", "Kontroll: gjenstår", "Godkjenning: gjenstår", "Last ned: gjenstår"]
  );
  assert.equal(mobileStepText("nb", 2), "Steg 2 av 5");
  assert.equal(mobileNextText("nb", 2), "Neste: Kontroll");
  assert.equal(mobileNextText("nb", 5), "Siste steg");
  assert.equal(mobileNextText("en", 4), "Next: Download");
});

test("ordlista: progress.* paa nb og en, engelsk er ikke norsk", () => {
  const nb = DICTIONARIES.nb.ui as Record<string, string>;
  const en = DICTIONARIES.en.ui as Record<string, string>;
  const keys = Object.keys(nb).filter((k) => k.startsWith("progress."));
  assert.ok(keys.length >= 16, String(keys.length));
  for (const k of keys) {
    assert.ok(nb[k].trim().length > 0, k);
    assert.ok(typeof en[k] === "string" && en[k].trim().length > 0, k);
    assert.doesNotMatch(en[k], /[æøå]|Bilder|Tjenester|Godkjenning|Neste/, k);
  }
  assert.equal(nb["progress.step.check"], "Kontroll");
  assert.equal(nb["progress.label"], "Fremdrift i ordren");
  assert.equal(nb["action.back"], "Tilbake");
});

test("beslutning 4: spilleren sier «godkjenning» og «gjennomgått», ikke «kontroll»", () => {
  const nb = DICTIONARIES.nb.ui;
  assert.equal(nb["player.nextToReview"], "Neste til godkjenning");
  assert.equal(t("nb", "player.next", { label: "Bad" }), "Neste til godkjenning: Bad");
  assert.equal(nb["player.noneWaiting"], "Ingen flere til godkjenning nå");
  assert.equal(t("nb", "player.progress", { reviewed: 1, total: 2 }), "1 av 2 gjennomgått");
  assert.equal(nb["player.allReviewed"], "Alt er gjennomgått");
  assert.equal(nb["player.allReviewedLink"], "Alt er gjennomgått. Gå til nedlasting");
  const en = DICTIONARIES.en.ui;
  assert.equal(en["player.nextToReview"], "Next for approval");
  assert.equal(t("en", "player.next", { label: "Bath" }), "Next for approval: Bath");
  assert.equal(en["player.noneWaiting"], "Nothing more for approval right now");
  // Uendret: tittelen paa godkjenningen og tilleggskontrollen.
  assert.equal(nb["review.title"], "Kontroll av bildet");
});

// --- minnet for fyllet ----------------------------------------------------------------------

test("forrige steg huskes per ordre; feil i lagringen svelges", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readLastStep(storage, ID), null);
  saveLastStep(storage, ID, 3);
  assert.equal(store.get(stepMemoryKey(ID)), "3");
  assert.equal(readLastStep(storage, ID), 3);
  assert.equal(readLastStep(storage, "annen"), null);
  store.set(stepMemoryKey(ID), "9");
  assert.equal(readLastStep(storage, ID), null);
  store.set(stepMemoryKey(ID), "x");
  assert.equal(readLastStep(storage, ID), null);
  const broken = {
    getItem: () => {
      throw new Error("blokkert");
    },
    setItem: () => {
      throw new Error("full");
    },
  };
  assert.equal(readLastStep(broken, ID), null);
  assert.doesNotThrow(() => saveLastStep(broken, ID, 2));
  assert.equal(readLastStep(null, ID), null);
  assert.doesNotMatch(stepMemoryKey(ID), /husvy/i);
});

// --- dobbel start ----------------------------------------------------------------------------

test("dobbeltklikk paa «Start behandling» starter bare én gang", async () => {
  const once = new OneAtATime();
  let calls = 0;
  let release: () => void = () => {};
  const start = () =>
    new Promise<void>((resolve) => {
      calls++;
      release = resolve;
    });
  const a = once.run(start);
  const b = once.run(start);
  assert.equal(calls, 1);
  assert.equal(once.running, true);
  release();
  await Promise.all([a, b]);
  assert.equal(once.running, false);
  // Etter svaret (f.eks. nettfeil og «Prøv igjen») kan den startes paa nytt.
  const c = once.run(start);
  assert.equal(calls, 2);
  release();
  await c;
  // En feil slipper vernet.
  await assert.rejects(once.run(() => Promise.reject(new Error("x"))));
  assert.equal(once.running, false);
});

// --- linja (kildeteksten) ---------------------------------------------------------------------

test("linja: nav med ol, aria-current, lenker bare med href, fast nederst i samme container", () => {
  const src = withoutComments(read("components/ordre/OrderProgress.tsx"));
  assert.match(src, /<nav aria-label=\{t\(locale, "progress\.label"\)\}/);
  assert.equal(src.match(/<ol /g)?.length, 2);
  assert.match(src, /aria-current=\{step\.state === "current" \? "step" : undefined\}/);
  assert.match(src, /if \(step\.href !== null\) \{\n\s*return \(\n\s*<Link href=\{step\.href\}/);
  assert.match(src, /<span className="sr-only">\{stepAria\(locale, step\)\}<\/span>/);
  assert.match(src, /fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface shadow-/);
  assert.match(src, /mx-auto flex w-full max-w-7xl /);
  assert.match(src, /px-4 /);
  assert.match(src, /md:px-8/);
  assert.match(src, /env\(safe-area-inset-bottom\)/);
  // Bunnmargen: en tom blokk med linjas hoeyde.
  assert.match(src, /<div aria-hidden style=\{\{ height \}\} \/>/);
  assert.match(src, /new ResizeObserver\(/);
  // Fyllet glir, men ikke med redusert bevegelse; forrige steg fra sessionStorage.
  assert.match(src, /transition-\[width\][^"]*motion-reduce:transition-none/);
  assert.match(src, /readLastStep\(sessionMemory\(\), id\)/);
  assert.match(src, /saveLastStep\(sessionMemory\(\), id, current\)/);
  // Mobil: tekstlinja og strekene under md, stegene med sirkler fra md.
  assert.match(src, /className="relative hidden md:block"/);
  assert.match(src, /className="flex flex-col gap-2 md:hidden"/);
  assert.match(src, /mobileStepText\(locale, current\)/);
  assert.match(src, /mobileNextText\(locale, current\)/);
  assert.match(src, /aria-label=\{t\(locale, "action\.back"\)\}/);
  // Linja tar ikke piltastene (spilleren bruker ← og →).
  assert.doesNotMatch(src, /onKeyDown|addEventListener\("keydown"/);
  // Ingen farger utenom tokenene.
  assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.deepEqual(literalTextsInFile(read("components/ordre/OrderProgress.tsx")), []);
});

test("knappen paa Godkjenning: neste, graa mens noe behandles, nedlasting, graa naar ingen venter", () => {
  const src = withoutComments(read("components/ordre/OrderProgress.tsx"));
  assert.match(src, /t\(locale, "player\.next", \{ label: nextLabel \}\)/);
  assert.match(src, /if \(state\.kind === "waiting"\) return <Button disabled>\{t\(locale, "player\.waiting", \{ n: state\.processing \}\)\}<\/Button>;/);
  assert.match(src, /if \(state\.kind === "all_reviewed"\) return <ButtonLink href=\{deliveryHref\}>\{t\(locale, "progress\.toDownload"\)\}<\/ButtonLink>;/);
  assert.match(src, /return <Button disabled>\{t\(locale, "player\.noneWaiting"\)\}<\/Button>;/);
});

// --- sidene ----------------------------------------------------------------------------------

test("sidene: hver har linja med sitt steg; Annonsetekst har den ikke", () => {
  const pages: [string, string][] = [
    ["(app)/ordrer/ny/page.tsx", "new"],
    ["components/ordre/OrderImages.tsx", "images"],
    ["components/ordre/ServiceBoard.tsx", "services"],
    ["components/ordre/OrderCheck.tsx", "check"],
    ["components/ordre/AssignmentPlayer.tsx", "player"],
    ["components/ordre/OrderDelivery.tsx", "delivery"],
  ];
  for (const [file, page] of pages) {
    const src = withoutComments(read(file));
    assert.equal(src.match(/<OrderProgress\b/g)?.length, 1, file);
    assert.match(src, new RegExp(`page="${page}"`), file);
  }
  for (const file of [
    "(app)/annonsetekst/page.tsx",
    "(app)/annonsetekst/[ordreId]/page.tsx",
    "components/annonsetekst/ListingTextOrder.tsx",
    "components/annonsetekst/ListingTextGate.tsx",
  ]) {
    assert.doesNotMatch(read(file), /OrderProgress/, file);
  }
  // Ny ordre: uten hovedknapp; skjemaet beholder sin submit-knapp (Enter).
  const fresh = withoutComments(read("(app)/ordrer/ny/page.tsx"));
  assert.match(fresh, /<OrderProgress page="new" assignment=\{null\} draftCount=\{0\} \/>/);
  assert.match(fresh, /<Button type="submit" disabled=\{submitting\}>/);
});

test("bildesiden: «Videre til tjenester» i linja (graa uten bilder), etter start knappen til neste som venter", () => {
  const src = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(src, /images\.length === 0 \? \(\n\s*<Button disabled>\{t\(locale, "orders\.next"\)\}<\/Button>/);
  assert.match(src, /const next = nextState\(images, null\);/);
  assert.match(src, /nextHref=\{next\.kind === "next" \? playerHref\(assignmentId, next\.pos\) : undefined\}/);
  assert.match(src, /hasResults \? \(\n\s*<ApprovalNextButton/);
  // «Bestill flere tjenester» er en vanlig knapp paa siden.
  assert.match(src, /\{hasResults && \(\n\s*<div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">\n\s*<ButtonLink variant="secondary"/);
});

test("brettet: egen fast bunnlinje er erstattet av linja; totalsText er undertekst", () => {
  const src = withoutComments(read("components/ordre/ServiceBoard.tsx"));
  assert.equal(src.match(/fixed inset-x-0 bottom-0/g), null);
  assert.doesNotMatch(src, /pb-32/);
  assert.match(src, /servicesNow=\{totalsText\(locale, totals\)\}/);
  assert.match(src, /items\.length === 0 \? \(\n\s*<Button disabled>\{t\(locale, "board\.next"\)\}<\/Button>/);
  assert.match(src, /draftCount=\{items\.length\}/);
  // Valg 2A: lenken oeverst gaar til ordrene.
  assert.match(src, /href=\{ORDERS_PATH\}/);
  assert.doesNotMatch(src, /"board\.back"/);
});

test("kontroll: start-knappen i linja med samme laas, vernet mot dobbel start, og ingen «Tilbake» nederst", () => {
  const src = withoutComments(read("components/ordre/OrderCheck.tsx"));
  assert.match(src, /const once = useRef\(new OneAtATime\(\)\);/);
  assert.match(src, /<Button onClick=\{\(\) => void once\.current\.run\(start\)\} disabled=\{running \|\| stop\?\.kind === "error"\}>/);
  assert.match(src, /!done && items\.length > 0 \? \(/);
  assert.match(src, /if \(running\) return;/);
  assert.doesNotMatch(src, /"check\.back"/);
  // Start-flyten er som foer (orderStart.ts): ett kall om gangen med noekkelen.
  assert.match(src, /const result = await sendRemaining\(from, \{/);
  assert.match(src, /keys: keys\.current,/);
  assert.match(src, /href=\{ORDERS_PATH\}/);
});

test("spilleren: blokka under resultatet er borte; knappen i linja hopper som foer", () => {
  const src = withoutComments(read("components/ordre/AssignmentPlayer.tsx"));
  assert.doesNotMatch(src, /"player\.allReviewedLink"/);
  assert.doesNotMatch(src, /className="flex flex-col gap-2 border-t border-line pt-6"/);
  assert.match(src, /onNext=\{next\.kind === "next" \? \(\) => select\(next\.pos, \{ focus: true \}\) : undefined\}/);
  // «← Til ordrene» oeverst blir staaende.
  assert.match(src, /href=\{ORDERS_PATH\}/);
});

test("last ned: ZIP-knappen i linja med samme laas; blokka med svaret er ikke sticky", () => {
  const src = withoutComments(read("components/ordre/OrderDelivery.tsx"));
  assert.doesNotMatch(src, /sticky/);
  assert.match(src, /<Button onClick=\{\(\) => void onZip\(\)\} disabled=\{running \|\| counts\.total === 0\}>/);
  assert.match(src, /primary=\{\n\s*manifest\.files\.length === 0 \? null : \(/);
  assert.match(src, /if \(inFlight\.current\) return;/);
  assert.match(src, /<ZipStatus/);
  assert.match(src, /href=\{ORDERS_PATH\}/);
  assert.doesNotMatch(src, /"delivery\.back"/);
});

test("veiledningen bruker de nye ordene", async () => {
  const { guidePage } = await import("../../content/marketing/nb/guide.ts");
  const all = guidePage.sections.map((s) => [...s.steps, ...(s.notes ?? [])].join("\n")).join("\n");
  assert.doesNotMatch(all, /[Tt]il kontroll|kontrollert/);
  assert.match(all, /«Neste til godkjenning»/);
  assert.match(all, /Trykk «Tilbake» for å endre noe\./);
});
