import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareVariants,
  makingImage,
  nextVersion,
  ORIGINAL_ID,
  rawCounterpart,
  selectedEntry,
  stripShown,
  versionStrip,
  type StripImages,
} from "./compare.ts";
import { DICTIONARIES, t } from "./i18n/index.ts";
import type { DecisionAction, ReviewRound } from "./api.ts";

// Dag 57: korreksjonsstudioet FE-3. Synlig «lager nytt bilde», og råbildet ut av stripa.

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Uten kommentarer, saa en kommentar ikke kan oppfylle eller bryte en sjekk. */
const code = (rel: string) =>
  readFileSync(join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = code("(app)/godkjenning/[jobId]/page.tsx");
const card = code("components/godkjenning/DecisionCard.tsx");
const panel = code("components/godkjenning/CorrectionPanel.tsx");
const strip = code("components/godkjenning/VersionStrip.tsx");
const overlay = code("components/godkjenning/MakingOverlay.tsx");

function round(n: number, extra: Partial<ReviewRound> = {}): ReviewRound {
  return { round: n, current: false, previewUrl: `p${n}.jpg`, rawPreviewUrl: `raw${n}.jpg`, choices: null, ...extra };
}

function images(rounds: ReviewRound[] | null, extra: Partial<StripImages> = {}): StripImages & { rounds: ReviewRound[] | null } {
  return {
    originalUrl: "orig.jpg",
    previewUrl: "top-preview.jpg",
    rawPreviewUrl: "top-raw.jpg",
    previous: { previewUrl: "top-previous.jpg" },
    rounds,
    ...extra,
  };
}

const TWO = images([round(1, { current: true }), round(0)]);

// ---------------------------------------------------------------------------
// Tilstanden: naar et nytt bilde lages
// ---------------------------------------------------------------------------

test("FE-3: laget vises fra klikket paa «Lag nytt bilde» eller «Lag bildet» og mens jobben kjoerer", () => {
  assert.equal(makingImage(false, "correct"), true);
  assert.equal(makingImage(false, "continue"), true);
  assert.equal(makingImage(true, null), true);
  // Godkjenn og Avvis lager ikke noe bilde.
  for (const action of ["approve", "reject"] as DecisionAction[]) assert.equal(makingImage(false, action), false, action);
  // Ferdig eller feil: verken kall eller polling, og laget forsvinner.
  assert.equal(makingImage(false, null), false);
});

test("FE-3: versjonen som lages er én mer enn den nyeste, ogsaa med hull og for admin", () => {
  assert.equal(nextVersion(compareVariants(TWO, { isAdmin: false })), 3);
  assert.equal(nextVersion(compareVariants(TWO, { isAdmin: true })), 3);
  assert.equal(nextVersion(compareVariants(images([round(0), round(3, { current: true })]), { isAdmin: false })), 5);
  // Ingen versjoner ennaa (stoppet, «Lag bildet»): versjon 1.
  assert.equal(nextVersion(compareVariants(images([]), { isAdmin: true })), 1);
  // Gamle jobber uten runder: forrige og løftet gir 3.
  assert.equal(nextVersion(compareVariants(images(null), { isAdmin: true })), 3);
  assert.equal(nextVersion(compareVariants(images(null, { previous: null }), { isAdmin: false })), 2);
});

test("FE-3: stripa vises alltid mens en versjon lages, ellers som foer", () => {
  const none = versionStrip(images([]), compareVariants(images([]), { isAdmin: false }));
  const one = versionStrip(images([round(0, { current: true })]), compareVariants(images([round(0, { current: true })]), { isAdmin: false }));
  assert.equal(stripShown(none), false);
  assert.equal(stripShown(one), false);
  assert.equal(stripShown(none, 1), true);
  assert.equal(stripShown(one, 2), true);
  assert.equal(stripShown(one, null), false);
});

// ---------------------------------------------------------------------------
// Råbildet: ikke i stripa, men som bryter for valgt versjon
// ---------------------------------------------------------------------------

test("FE-3: stripa har aldri råbildet, heller ikke for admin eller gamle jobber", () => {
  for (const imgs of [TWO, images(null), images([round(0, { current: true })])]) {
    const s = versionStrip(imgs, compareVariants(imgs, { isAdmin: true }));
    assert.ok(s.every((e) => e.kind === "original" || !e.variant.raw), JSON.stringify(s.map((e) => e.id)));
    assert.ok(!s.some((e) => /raw/.test(e.id)));
  }
});

test("FE-3: bryteren viser råbildet for versjonen som er valgt, bare for admin", () => {
  const admin = compareVariants(TWO, { isAdmin: true });
  const s = versionStrip(TWO, admin);
  assert.equal(rawCounterpart(admin, selectedEntry(s, null))?.id, "r1-raw");
  assert.equal(rawCounterpart(admin, selectedEntry(s, "r0"))?.id, "r0-raw");
  assert.equal(rawCounterpart(admin, selectedEntry(s, ORIGINAL_ID)), null);
  assert.equal(rawCounterpart(admin, null), null);
  // Megleren har ingen raa varianter: ingen bryter.
  const owner = compareVariants(TWO, { isAdmin: false });
  assert.equal(rawCounterpart(owner, selectedEntry(versionStrip(TWO, owner), null)), null);
  // Gamle jobber: bare løftet har et råbilde, ikke forrige runde.
  const legacy = compareVariants(images(null), { isAdmin: true });
  const ls = versionStrip(images(null), legacy);
  assert.equal(rawCounterpart(legacy, selectedEntry(ls, "legacy-lifted"))?.id, "legacy-raw");
  assert.equal(rawCounterpart(legacy, selectedEntry(ls, "legacy-previous")), null);
});

// ---------------------------------------------------------------------------
// Siden: tilstanden som finnes, låsene og nullstillingen
// ---------------------------------------------------------------------------

test("FE-3: siden bruker tilstanden som finnes (polling og pending), uten nye kall", () => {
  assert.match(page, /const locked = busy \|\| blocked \|\| polling;/);
  assert.match(page, /const making = makingImage\(polling, pending\) \? nextVersion\(variants\) : null;/);
  // «Lag nytt bilde»: pending er "correct" fra klikket til svaret, saa null igjen.
  const submit = page.slice(page.indexOf("const handleCorrection"), page.indexOf("const submitLocal"));
  assert.match(submit, /onStart: \(\) => \{\s*setBusy\(true\);\s*setPending\("correct"\);/);
  assert.match(submit, /onSettled: \(\) => \{\s*setBusy\(false\);\s*setPending\(null\);\s*\}/);
  assert.match(submit, /case "poll":\s*cancelCorrection\(\);\s*setPollJobId\(jobId\);/);
  // Ingen nye kall: getReview og postDecision (pluss /me). FE-3 (Dag 58): «Lag 2 forslag» og
  // «Bruk denne» sender ogsaa gjennom postDecision, saa det er fire steder.
  assert.equal(page.match(/postDecision\(/g)?.length, 4);
  assert.doesNotMatch(page, /fetch\(/);
});

test("FE-3: laget ligger over visningen, som er inert saa lenge, og stripa faar plassholderen", () => {
  assert.match(
    page,
    /<div className="relative">\s*<div inert=\{making !== null\}>\s*\{isLocal && review\.images\.previewUrl !== null \? \(\s*<StudioCanvas[\s\S]*?\/>\s*\) : \(\s*<CompareViewer[\s\S]*?\/>\s*\)\}\s*<\/div>\s*\{making !== null && <MakingOverlay version=\{making\} locale=\{locale\} \/>\}\s*<\/div>/
  );
  assert.equal(page.match(/making=\{making\}/g)?.length, 2);
  assert.match(page, /stripShown\(strip, making\)/);
});

test("FE-3: knappene er laast mens bildet lages (Godkjenn, Korriger bildet, Lag nytt bilde, Avvis)", () => {
  assert.match(page, /locked=\{locked\}\s*busy=\{busy\}/);
  assert.match(card, /disabled=\{locked \|\| approveLock \|\| !approveEnabled\(additions\.level, compared, acknowledged\)\}/);
  assert.match(card, /<button onClick=\{onStartCorrection\} disabled=\{locked\}/);
  assert.match(card, /<button onClick=\{\(\) => onRejectOpen\(true\)\} disabled=\{locked\}/);
  assert.match(panel, /<button onClick=\{onSubmit\} disabled=\{locked \|\| !submitEnabled\}/);
});

test("FE-3: råbildet er en bryter under bildet, laaser «Godkjenn» og nullstilles ved ny henting", () => {
  assert.match(page, /const raw = rawCounterpart\(variants, entry\);/);
  assert.match(page, /const rawOn = rawShown && raw !== null;/);
  assert.match(page, /const approveLock = approveLocked\(strip, entry\) \|\| rawOn;/);
  assert.match(
    page,
    /\{raw !== null && \(\s*<div>\s*<button\s+type="button"\s+onClick=\{\(\) => setRawShown\(!rawOn\)\}\s+aria-pressed=\{rawOn\}[\s\S]*?\{t\(locale, "compare\.showRaw"\)\}/
  );
  const fetch = page.slice(page.indexOf("const fetchReview"), page.indexOf("useEffect("));
  assert.match(fetch, /setRawShown\(false\);/);
});

// ---------------------------------------------------------------------------
// Komponentene og ordene
// ---------------------------------------------------------------------------

test("FE-3: laget har rolig animasjon som staar stille ved redusert bevegelse, og teksten fra ordlista", () => {
  assert.match(overlay, /role="status"/);
  assert.match(overlay, /animate-spin [^"]*motion-reduce:animate-none/);
  assert.match(overlay, /t\(locale, "compare\.makingTitle", \{ n: version \}\)/);
  assert.match(overlay, /t\(locale, "compare\.makingHint"\)/);
  // Plassholderen i stripa er ikke en knapp, og pulsen staar stille ved redusert bevegelse.
  const tile = strip.slice(strip.indexOf("{making !== null && ("));
  assert.doesNotMatch(tile.slice(0, tile.indexOf("</span>\n        )}")), /<button/);
  assert.match(tile, /animate-pulse motion-reduce:animate-none/);
  assert.match(tile, /t\(locale, "compare\.makingShort"\)/);
  assert.match(strip, /if \(!stripShown\(strip, making\)\) return null;/);
});

test("FE-3: ordene paa nb og en", () => {
  assert.equal(t("nb", "compare.makingTitle", { n: 3 }), "Lager versjon 3 …");
  assert.equal(t("nb", "compare.makingHint"), "Det tar vanligvis rundt ett minutt.");
  assert.equal(t("nb", "compare.makingShort"), "Lages …");
  assert.equal(t("nb", "compare.showRaw"), "Vis rått svar fra modellen (bare admin)");
  for (const key of ["compare.makingTitle", "compare.makingHint", "compare.makingShort", "compare.showRaw"] as const) {
    assert.ok(DICTIONARIES.en.ui[key].length > 0, key);
    assert.notEqual(DICTIONARIES.en.ui[key], DICTIONARIES.nb.ui[key], key);
  }
});
