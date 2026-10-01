import { test } from "node:test";
import assert from "node:assert/strict";
import {
  showDetails,
  effectiveScope,
  emptyWaitingKey,
  isReadOnlyOther,
  ownerBadge,
  rejectedLabelKey,
  scopeFallback,
  showScopeToggle,
  subtitleKey,
  waitingLabelKey,
} from "./roles.ts";
import { outcome } from "./review.ts";
import { DICTIONARIES, t, type UiKey } from "./i18n/index.ts";

test("bryteren vises bare naar view_all er true", () => {
  assert.equal(showScopeToggle({ viewAll: true }), true);
  assert.equal(showScopeToggle({ viewAll: false }), false);
  // Ikke hentet ennaa, eller /me uten capabilities: ingen bryter.
  assert.equal(showScopeToggle(null), false);
});

test("scope=all bare naar «Alle brukere» er valgt og bryteren vises", () => {
  assert.equal(effectiveScope({ viewAll: true }, "all"), "all");
  assert.equal(effectiveScope({ viewAll: true }, "mine"), "mine");
  // Uten view_all sendes aldri all, selv om valget skulle staa paa all.
  assert.equal(effectiveScope({ viewAll: false }, "all"), "mine");
  assert.equal(effectiveScope(null, "all"), "mine");
});

test("«Venter» og tomtekst uten «meg» naar alle brukere vises (valg A)", () => {
  assert.equal(waitingLabelKey("mine"), "history.waitingForMe");
  assert.equal(waitingLabelKey("all"), "history.waiting");
  assert.equal(emptyWaitingKey("mine"), "history.emptyWaiting");
  assert.equal(emptyWaitingKey("all"), "history.emptyWaitingAll");
  assert.equal(subtitleKey("mine"), "history.subtitle");
  assert.equal(subtitleKey("all"), "history.subtitleAll");
});

test("kort for andres jobb faar «Annen bruker» og eier; egne og eldre svar ikke", () => {
  assert.deepEqual(ownerBadge({ isOwner: false, ownerShort: "abc123" }), { ownerShort: "abc123" });
  assert.deepEqual(ownerBadge({ isOwner: false, ownerShort: null }), { ownerShort: null });
  assert.equal(ownerBadge({ isOwner: true, ownerShort: "abc123" }), null);
});

test("avvist-merket sier «av eieren» paa andres jobb", () => {
  assert.equal(rejectedLabelKey({ isOwner: true }), "history.rejectedByYou");
  assert.equal(rejectedLabelKey({ isOwner: false }), "history.rejectedByOwner");
});

test("linja om bare lesing vises bare naar is_owner er false", () => {
  assert.equal(isReadOnlyOther({ isOwner: false }), true);
  assert.equal(isReadOnlyOther({ isOwner: true }), false);
});

test("outcome: avvist paa andres jobb gir «Avvist av eieren»", () => {
  const decisions = [{ action: "reject", at: null, byRole: "owner", reason: "mørkt" }];
  assert.deepEqual(outcome({ status: "failed", decisions, isOwner: false }), {
    key: "review.statusRejectedByOwner",
    reason: "mørkt",
  });
  assert.deepEqual(outcome({ status: "failed", decisions, isOwner: true }), {
    key: "review.statusRejected",
    reason: "mørkt",
  });
  // Uten feltet (eldre svar): som foer.
  assert.equal(outcome({ status: "failed", decisions })?.key, "review.statusRejected");
});

test("403 scope_not_allowed og 422 invalid_scope gir tilbakefall, aldri krasj", () => {
  assert.deepEqual(scopeFallback({ httpStatus: 403, code: "scope_not_allowed" }), {
    hideToggle: true,
    messageKey: "history.scopeFallback",
  });
  assert.deepEqual(scopeFallback({ httpStatus: 422, code: "invalid_scope" }), {
    hideToggle: false,
    messageKey: "history.scopeFallback",
  });
  // Andre feil er vanlige feil.
  for (const err of [
    { httpStatus: 422, code: "invalid_status_filter" },
    { httpStatus: 403, code: null },
    { httpStatus: 500, code: null },
    new Error("nett"),
    null,
    undefined,
    "tekst",
  ]) {
    assert.equal(scopeFallback(err), null, String(err));
  }
});

test("nb og en har tekst for alle TG-NEW-127-noeklene", () => {
  const keys: UiKey[] = [
    "history.scope.mine",
    "history.scope.all",
    "history.waiting",
    "history.emptyWaitingAll",
    "history.subtitle",
    "history.subtitleAll",
    "history.notYours",
    "history.owner",
    "history.rejectedByOwner",
    "history.scopeFallback",
    "review.readOnlyOther",
    "review.statusRejectedByOwner",
    "review.analysisTitle",
  ];
  for (const key of keys) {
    for (const locale of ["nb", "en"] as const) {
      assert.ok(Object.hasOwn(DICTIONARIES[locale].ui, key), `${locale}/${key}`);
      assert.notEqual(t(locale, key).trim(), "", `${locale}/${key}`);
    }
  }
  assert.equal(t("nb", "history.scope.mine"), "Mine jobber");
  assert.equal(t("nb", "history.scope.all"), "Alle brukere");
  assert.equal(t("en", "history.scope.all"), "All users");
  assert.equal(t("nb", "review.readOnlyOther"), "Du ser en annen brukers jobb. Bare lesing.");
});

test("«Detaljer» og rått bare naar view_all er true (D2a/D2b)", () => {
  assert.equal(showDetails({ viewAll: true }), true);
  assert.equal(showDetails({ viewAll: false }), false);
  assert.equal(showDetails(null), false);
});
