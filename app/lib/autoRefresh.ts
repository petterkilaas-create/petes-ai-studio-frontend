/**
 * Automatisk henting i Historikk mens jobber lages (ventebildet). Ren
 * planlegger uten React og uten nettleser-API, saa den kan testes med
 * node --test; hooken i app/hooks/useAutoRefresh.ts kobler den til
 * setTimeout og document.visibilityState.
 *
 * Petter 02.10:
 * - hvert 5. sekund, tak paa 10 minutter fra start
 * - neste henting planlegges foerst naar forrige er ferdig (ingen overlapp)
 * - pause naar fanen er skjult, ny henting med en gang den vises igjen
 * - stopper naar ingen jobber er i arbeid, og etter 3 feil paa rad
 *
 * Bildesiden i ordren (FE-3) bruker samme planlegger med tak paa 30 minutter
 * (`maxMs`): 25 resultater kan ta 15-20 minutter (audit punkt 3).
 */

export const AUTO_REFRESH_MS = 5_000;
export const AUTO_REFRESH_MAX_MS = 10 * 60_000;
export const AUTO_REFRESH_MAX_ERRORS = 3;
/** Taket for bildesiden i ordren (FE-3): én henting av hele ordren hvert 5. sekund i hoeyst 30 minutter. */
export const ORDER_REFRESH_MAX_MS = 30 * 60_000;

/** Svaret fra en henting: om den gikk, og om noen jobber fortsatt er i arbeid. */
export interface RefreshResult {
  ok: boolean;
  working: boolean;
}

export interface AutoRefreshDeps {
  refresh: () => Promise<RefreshResult>;
  hidden: () => boolean;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
  /** Taket fra start; standard AUTO_REFRESH_MAX_MS (Historikk). */
  maxMs?: number;
}

export interface AutoRefreshControl {
  /** Fanen er synlig igjen: hent med en gang hvis hentingen tok pause. */
  visible: () => void;
  stop: () => void;
}

export function startAutoRefresh(deps: AutoRefreshDeps): AutoRefreshControl {
  const startedAt = deps.now();
  const maxMs = deps.maxMs ?? AUTO_REFRESH_MAX_MS;
  let timer: unknown = null;
  let inFlight = false;
  let paused = false;
  let stopped = false;
  let errors = 0;

  const stop = () => {
    stopped = true;
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };

  const schedule = () => {
    if (stopped || timer !== null || inFlight) return;
    timer = deps.setTimer(() => {
      timer = null;
      void tick();
    }, AUTO_REFRESH_MS);
  };

  const tick = async () => {
    if (stopped || inFlight) return;
    if (deps.hidden()) {
      paused = true;
      return;
    }
    if (deps.now() - startedAt >= maxMs) {
      stop();
      return;
    }
    inFlight = true;
    let result: RefreshResult;
    try {
      result = await deps.refresh();
    } catch {
      result = { ok: false, working: true };
    }
    inFlight = false;
    if (stopped) return;
    errors = result.ok ? 0 : errors + 1;
    if (errors >= AUTO_REFRESH_MAX_ERRORS || !result.working) {
      stop();
      return;
    }
    schedule();
  };

  schedule();

  return {
    visible: () => {
      if (!paused || stopped) return;
      paused = false;
      void tick();
    },
    stop,
  };
}
