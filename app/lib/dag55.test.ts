import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./testing/jsxText.ts";
import type { FurnishAs, StylingChoice } from "./styling.ts";

// Dag 55 (TG-NEW-250, Petter 24.10 og 26.10): meglerens ønsker i Digital
// styling, bare for stuene, og teksten ved Stjernehimmel (S4). api.ts kaster
// ved import uten NEXT_PUBLIC_API_BASE; fetch byttes ut, ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { OrderKeys } = await import("./orderKey.ts");
const { DICTIONARIES, t } = await import("./i18n/index.ts");
const {
  EMPTY_STYLING,
  FURNISH_AS_CHOICES,
  STYLING_ORDER_SERVICE,
  WISH_ROOMS,
  WISH_SUGGESTIONS,
  WISHES_MAX,
  addSuggestion,
  clampWishes,
  isWishRoom,
  stylingParams,
  wishesLength,
  wishSuggestions,
} = await import("./styling.ts");

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Et komplett valg i rommet, med ønsket. */
const choice = (furnishAs: FurnishAs, wishes = ""): StylingChoice => ({
  ...EMPTY_STYLING,
  furnishAs,
  roomEmpty: true,
  styles: ["styling_japandi"],
  wishes,
});
const OTHER_ROOMS = FURNISH_AS_CHOICES.filter((r) => r !== "living" && r !== "living_dining");

// --- Rommene og tellingen -----------------------------------------------------

test("Dag 55: ønsker bare for Stue og Stue og spisestue", () => {
  assert.deepEqual([...WISH_ROOMS], ["living", "living_dining"]);
  assert.equal(isWishRoom("living"), true);
  assert.equal(isWishRoom("living_dining"), true);
  assert.equal(OTHER_ROOMS.length, 7);
  for (const room of OTHER_ROOMS) assert.equal(isWishRoom(room), false, room);
  assert.equal(isWishRoom(null), false);
  assert.equal(EMPTY_STYLING.wishes, "");
});

test("Dag 55: tellingen bruker kodepunkter (Array.from), som backend", () => {
  assert.equal(WISHES_MAX, 300);
  assert.equal(wishesLength(""), 0);
  assert.equal(wishesLength("æøå"), 3);
  assert.equal(wishesLength("🛋️"), 2); // sofa + variantvelger: to kodepunkter
  assert.equal(wishesLength("😀😀"), 2); // 4 UTF-16-enheter, 2 kodepunkter
  assert.equal("😀😀".length, 4);
  // Klemmingen i feltet: høyst 300 kodepunkter, og en emoji deles aldri.
  assert.equal(clampWishes("a".repeat(300)), "a".repeat(300));
  assert.equal(clampWishes("a".repeat(310)), "a".repeat(300));
  const emojis = "😀".repeat(301);
  assert.equal(wishesLength(clampWishes(emojis)), 300);
  assert.equal(clampWishes(emojis), "😀".repeat(300));
});

// --- params ---------------------------------------------------------------------

test("Dag 55: wishes sendes trimmet, sist, bare for stuene og bare når det ikke er tomt", () => {
  for (const room of WISH_ROOMS) {
    assert.deepEqual(stylingParams(choice(room, "  Rundt spisebord  ")), {
      styles: ["styling_japandi"],
      furnish_as: room,
      room_empty_confirmed: true,
      wishes: "Rundt spisebord",
    });
    assert.deepEqual(Object.keys(stylingParams({ ...choice(room, "Ingen lenestol"), decor: 3 }) ?? {}), [
      "styles",
      "furnish_as",
      "room_empty_confirmed",
      "decor_level",
      "wishes",
    ]);
    // Tomt eller bare mellomrom: nøkkelen utelates helt.
    for (const empty of ["", "   ", "\n\t "]) {
      const params = stylingParams(choice(room, empty));
      assert.ok(params);
      assert.equal("wishes" in params, false, JSON.stringify(empty));
    }
  }
});

test("Dag 55: i andre rom sendes ikke ønsket, også når teksten står igjen etter et rombytte", () => {
  for (const room of OTHER_ROOMS) {
    const params = stylingParams(choice(room, "Sofaen mot vinduet"));
    assert.ok(params, room);
    assert.equal("wishes" in params, false, room);
    assert.deepEqual(params, stylingParams(choice(room)), room);
  }
  // Megleren skrev i Stue og byttet til Soverom: teksten står, men følger ikke med.
  const living = choice("living", "Ingen lenestol");
  const switched = { ...living, furnishAs: "bedroom" as const };
  assert.equal(switched.wishes, "Ingen lenestol");
  assert.equal("wishes" in (stylingParams(switched) ?? {}), false);
  // Tilbake til Stue: ønsket følger med igjen.
  assert.equal(stylingParams({ ...switched, furnishAs: "living" })?.wishes, "Ingen lenestol");
});

test("Dag 55: over 300 tegn gir null (ingenting kuttes stille); 300 kodepunkter går", () => {
  assert.equal(stylingParams(choice("living", "a".repeat(300)))?.wishes, "a".repeat(300));
  assert.equal(stylingParams(choice("living", "😀".repeat(300)))?.wishes, "😀".repeat(300));
  assert.equal(stylingParams(choice("living", "a".repeat(301))), null);
  // Mellomrom rundt teller ikke (trimmes foer tellingen).
  assert.equal(stylingParams(choice("living", ` ${"a".repeat(300)} `))?.wishes, "a".repeat(300));
});

test("Dag 55: kallet sender wishes i params_json; uten ønske er params_json som før", async () => {
  const seen: FormData[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen.push(init?.body as FormData);
    return new Response(JSON.stringify({ order_id: "o", duplicate: false, jobs: [], quota: null }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const image = new File([new Uint8Array([1])], "rom.jpg", { type: "image/jpeg" });
  const getToken = async () => "tok";
  for (const c of [choice("living_dining", "Rundt spisebord"), choice("living_dining")]) {
    const params = stylingParams(c);
    assert.ok(params);
    await api.submitStylingOrder({ image, params, idempotencyKey: "k", getToken });
  }
  assert.equal(
    String(seen[0].get("params_json")),
    '{"styles":["styling_japandi"],"furnish_as":"living_dining","room_empty_confirmed":true,"wishes":"Rundt spisebord"}'
  );
  assert.equal(
    String(seen[1].get("params_json")),
    '{"styles":["styling_japandi"],"furnish_as":"living_dining","room_empty_confirmed":true}'
  );
});

// --- Idempotensnøkkelen ---------------------------------------------------------

test("Dag 55: idempotensnøkkelen skiller ulike ønsker, og er som før uten ønske", () => {
  let n = 0;
  const keys = new OrderKeys(() => `key-${++n}`);
  const file = new File([new Uint8Array([1])], "rom.jpg", { type: "image/jpeg" });
  const order = (wishes: string) => ({ file, service: STYLING_ORDER_SERVICE, params: stylingParams(choice("living", wishes)) });
  const a = keys.keyFor(order("Ingen lenestol"));
  assert.equal(keys.keyFor(order("Ingen lenestol")), a, "samme ønske: samme bestilling (nytt forsøk)");
  // Mellomrom rundt endrer ikke params, og dermed ikke nøkkelen.
  assert.equal(keys.keyFor(order("  Ingen lenestol ")), a);
  const b = keys.keyFor(order("Sofaen mot vinduet"));
  assert.notEqual(b, a, "et annet ønske: ny bestilling");
  const c = keys.keyFor(order(""));
  assert.notEqual(c, b, "uten ønske: ny bestilling");
  // Uten ønske er params (og dermed nøkkelen) lik et valg uten feltet i det hele tatt.
  assert.deepEqual(stylingParams(choice("living", "")), { styles: ["styling_japandi"], furnish_as: "living", room_empty_confirmed: true });
  assert.equal(keys.keyFor({ file, service: STYLING_ORDER_SERVICE, params: { styles: ["styling_japandi"], furnish_as: "living", room_empty_confirmed: true } }), c);
});

// --- Forslagene -----------------------------------------------------------------

test("Dag 55: forslagene per rom, i fast rekkefølge, med norsk tekst som sendes", () => {
  assert.deepEqual(
    wishSuggestions("living_dining").map((id) => WISH_SUGGESTIONS[id]),
    ["Sofaen mot vinduet", "Rundt spisebord", "Langbord til åtte personer", "Spisebordet ved vinduet", "Ingen lenestol", "Hold området ved døra fritt"]
  );
  assert.deepEqual(
    wishSuggestions("living").map((id) => WISH_SUGGESTIONS[id]),
    ["Sofaen mot vinduet", "Ingen lenestol", "Hold området ved døra fritt"]
  );
  for (const room of OTHER_ROOMS) assert.deepEqual(wishSuggestions(room), [], room);
  assert.deepEqual(wishSuggestions(null), []);
  // Knappen vises oversatt; nb-knappen er den samme teksten som sendes.
  for (const id of Object.keys(WISH_SUGGESTIONS) as (keyof typeof WISH_SUGGESTIONS)[]) {
    assert.equal(t("nb", `styling.wish.${id}`), WISH_SUGGESTIONS[id], id);
    assert.notEqual(t("en", `styling.wish.${id}`), WISH_SUGGESTIONS[id], id);
  }
  assert.equal(t("en", "styling.wish.round_table"), "Round dining table");
});

test("Dag 55: et trykk legger forslaget til med «. » mellom, og ingenting uten plass", () => {
  assert.equal(addSuggestion("", "round_table"), "Rundt spisebord");
  assert.equal(addSuggestion("   ", "round_table"), "Rundt spisebord");
  assert.equal(addSuggestion("Rundt spisebord", "no_armchair"), "Rundt spisebord. Ingen lenestol");
  // Ingen dobbelt punktum, og mellomrom til slutt fjernes foerst.
  assert.equal(addSuggestion("Rundt spisebord. ", "no_armchair"), "Rundt spisebord. Ingen lenestol");
  assert.equal(addSuggestion("Rundt spisebord.", "no_armchair"), "Rundt spisebord. Ingen lenestol");
  // Plass: akkurat 300 gaar, 301 gir null (knappen er av).
  const fill = (n: number) => "a".repeat(n);
  const suggestion = WISH_SUGGESTIONS.no_armchair;
  const fits = fill(WISHES_MAX - suggestion.length - 2);
  assert.equal(wishesLength(addSuggestion(fits, "no_armchair") ?? ""), 300);
  assert.equal(addSuggestion(fits + "a", "no_armchair"), null);
  assert.equal(addSuggestion(fill(300), "no_armchair"), null);
});

// --- Velgeren og ordlista -------------------------------------------------------

test("Dag 55: velgeren viser feltet bare i stuene, ellers én linje, og telleren er «x / 300»", () => {
  const picker = read("components/StylingChoicePicker.tsx");
  const decor = picker.indexOf("[null, ...DECOR_LEVELS].map(");
  const textarea = picker.indexOf("<textarea");
  assert.ok(decor > 0 && textarea > decor, "4 · ønskene står etter pynten");
  assert.match(picker, /const wishRoom = isWishRoom\(value\.furnishAs\);/);
  assert.match(picker, /\{!wishRoom && <p className="text-sm text-ink-2">\{t\(locale, "styling\.wishesOnlyLiving"\)\}<\/p>\}/);
  assert.match(picker, /\{wishRoom && \(/);
  assert.ok(picker.indexOf("{wishRoom && (") < textarea, "feltet ligger i grenen for stuene");
  // Feltet klemmes i onChange (ingen maxLength, den teller UTF-16).
  assert.match(picker, /onChange=\{\(e\) => onChange\(\{ \.\.\.value, wishes: clampWishes\(e\.target\.value\) \}\)\}/);
  assert.doesNotMatch(picker, /maxLength/);
  // Forslaget er av naar det ikke er plass.
  assert.match(picker, /disabled=\{disabled \|\| next === null\}/);
  assert.match(picker, /t\(locale, "styling\.wishesCount", \{ n: Math\.min\(wishesLength\(value\.wishes\), WISHES_MAX\) \}\)/);
  assert.equal(t("nb", "styling.wishesCount", { n: 300 }), "300 / 300");
  assert.equal(t("en", "styling.wishesCount", { n: 12 }), "12 / 300");
});

test("Dag 55: tekstene for ønskefeltet på nb og en", () => {
  assert.equal(t("nb", "styling.wishes"), "Ønsker (valgfritt)");
  assert.equal(t("en", "styling.wishes"), "Wishes (optional)");
  assert.equal(t("nb", "styling.wishesOnlyLiving"), "Ønsker gjelder foreløpig bare stuene.");
  assert.equal(t("en", "styling.wishesOnlyLiving"), "Wishes only apply to living rooms for now.");
  assert.equal(
    t("nb", "styling.wishesHelp"),
    "Skriv kort hvor møblene skal stå og hvilken form de skal ha. Vinduer, dører, peis og andre faste ting endres aldri. Ikke skriv navn eller adresse."
  );
  assert.match(t("en", "styling.wishesHelp"), /Do not write names or addresses\.$/);
  for (const locale of ["nb", "en"] as const) {
    const keys = Object.keys(DICTIONARIES[locale].ui).filter((k) => k.startsWith("styling.wish"));
    assert.equal(keys.length, 5 + Object.keys(WISH_SUGGESTIONS).length, locale);
  }
});

test("Dag 55: ønsket logges aldri (ingen console og ingen analyse i filene som har det)", () => {
  for (const rel of [
    "lib/styling.ts",
    "lib/api.ts",
    "lib/orderKey.ts",
    "hooks/useOrderJobs.ts",
    "components/StylingChoicePicker.tsx",
    "(app)/tjenester/page.tsx",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /console\.|analytics|track\(|posthog|gtag/i, rel);
  }
});

// --- Stjernehimmel --------------------------------------------------------------

test("Dag 55 (S4): teksten ved Stjernehimmel, bare når den er valgt, i aria-live", () => {
  assert.equal(t("nb", "dusk.starryNote"), "Ikke for bilder fra mai–juli.");
  assert.equal(t("en", "dusk.starryNote"), "Not for photos taken May–July.");
  const picker = read("components/DuskChoicePicker.tsx");
  assert.match(picker, /const starry = value\.sky === "starry";/);
  assert.match(picker, /<p aria-live="polite"[^>]*>\s*\{starry \? t\(locale, "dusk\.starryNote"\) : ""\}\s*<\/p>/);
  // Ingen sperre: himmelknappene er som foer.
  assert.match(picker, /onClick=\{\(\) => onChange\(changeSky\(value, sky\)\)\}\s*disabled=\{disabled\}/);
});
