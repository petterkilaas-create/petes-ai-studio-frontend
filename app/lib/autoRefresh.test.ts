import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_REFRESH_MAX_MS,
  AUTO_REFRESH_MS,
  startAutoRefresh,
  type RefreshResult,
} from "./autoRefresh.ts";

/**
 * Ventebildet: den automatiske hentingen i Historikk (Petter 02.10): 5 s,
 * tak 10 min, ingen overlapp, pause naar fanen er skjult.
 * Klokke og tidtaker er falske, saa testen styrer tiden selv.
 */
function harness(results: (RefreshResult | "hang")[]) {
  const state = {
    now: 0,
    hidden: false,
    timers: [] as { fn: () => void; ms: number; id: number }[],
    calls: 0,
    pending: [] as ((r: RefreshResult) => void)[],
  };
  let nextId = 1;
  const control = startAutoRefresh({
    refresh: () => {
      state.calls++;
      const r = results.shift() ?? { ok: true, working: true };
      if (r === "hang") return new Promise<RefreshResult>((resolve) => state.pending.push(resolve));
      return Promise.resolve(r);
    },
    hidden: () => state.hidden,
    now: () => state.now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      state.timers.push({ fn, ms, id });
      return id;
    },
    clearTimer: (id) => {
      state.timers = state.timers.filter((t) => t.id !== id);
    },
  });
  /** Lar tiden gaa til neste tidtaker og venter til hentingen er ferdig. */
  const fire = async () => {
    const timer = state.timers.shift();
    assert.ok(timer, "en tidtaker var planlagt");
    assert.equal(timer.ms, AUTO_REFRESH_MS);
    state.now += timer.ms;
    timer.fn();
    await new Promise((r) => setImmediate(r));
  };
  return { state, control, fire };
}

test("henter hvert 5. sekund saa lenge jobber er i arbeid, og stopper naar ingen er det", async () => {
  const { state, fire } = harness([
    { ok: true, working: true },
    { ok: true, working: true },
    { ok: true, working: false },
  ]);
  assert.equal(state.timers.length, 1, "foerste henting planlagt");
  assert.equal(state.calls, 0, "ingen henting med en gang (lista er nettopp hentet)");
  await fire();
  await fire();
  await fire();
  assert.equal(state.calls, 3);
  assert.equal(state.timers.length, 0, "stoppet: ingen jobber i arbeid");
});

test("ingen overlapp: neste henting planlegges foerst naar forrige er ferdig", async () => {
  const { state, control, fire } = harness(["hang"]);
  await fire();
  assert.equal(state.calls, 1);
  assert.equal(state.timers.length, 0, "ingen ny tidtaker mens hentingen pågår");
  // Fanen vises igjen mens hentingen pågår: ingen ekstra henting.
  control.visible();
  assert.equal(state.calls, 1);
  state.pending[0]({ ok: true, working: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(state.timers.length, 1, "neste planlagt etter svaret");
  assert.equal(state.calls, 1);
});

test("pause naar fanen er skjult, og ny henting med en gang den vises igjen", async () => {
  const { state, control, fire } = harness([]);
  state.hidden = true;
  await fire();
  assert.equal(state.calls, 0, "skjult fane: ingen henting");
  assert.equal(state.timers.length, 0, "ingen ny tidtaker mens fanen er skjult");
  state.hidden = false;
  control.visible();
  await new Promise((r) => setImmediate(r));
  assert.equal(state.calls, 1, "henter med en gang fanen vises");
  assert.equal(state.timers.length, 1);
  // visible() uten pause gjoer ingenting.
  control.visible();
  await new Promise((r) => setImmediate(r));
  assert.equal(state.calls, 1);
});

test("taket paa 10 minutter stopper hentingen", async () => {
  const { state, fire } = harness([]);
  const rounds = AUTO_REFRESH_MAX_MS / AUTO_REFRESH_MS;
  for (let i = 0; i < rounds; i++) await fire();
  assert.equal(state.calls, rounds - 1, "siste runde naar taket og henter ikke");
  assert.equal(state.timers.length, 0);
});

test("stopper etter 3 feil paa rad; en vellykket henting nullstiller tellingen", async () => {
  const fail = { ok: false, working: true };
  const { state, fire } = harness([fail, fail, { ok: true, working: true }, fail, fail, fail]);
  for (let i = 0; i < 6; i++) await fire();
  assert.equal(state.calls, 6);
  assert.equal(state.timers.length, 0);
});

test("stop() rydder tidtakeren, og et svar etter stop planlegger ikke mer", async () => {
  const { state, control, fire } = harness(["hang"]);
  await fire();
  control.stop();
  state.pending[0]({ ok: true, working: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(state.timers.length, 0);
  const second = harness([]);
  second.control.stop();
  assert.equal(second.state.timers.length, 0);
});
