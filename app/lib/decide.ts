import type { DecisionOutcome } from "./api";

/**
 * Felles gang for en avgjoerelse paa godkjenningssiden (TG-NEW-130), skilt ut
 * saa den kan testes uten React (node --test). Bare type-importer: api.ts
 * kaster ved import naar NEXT_PUBLIC_API_BASE mangler.
 */

/** Synkront vern mot dobbeltklikk (en useRef paa siden). */
export interface InFlight {
  current: boolean;
}

/**
 * Sender en avgjoerelse med vern mot dobbeltklikk; busy-state rekker ikke aa
 * oppdatere mellom to raske klikk. Etter 200 og 409 status_changed hentes
 * review paa nytt foer `handle`, saa neste avgjoerelse sender den nye
 * versjonen. Gir false naar et kall allerede var i gang (ingenting sendt).
 */
export async function runDecision(opts: {
  inFlight: InFlight;
  send: () => Promise<DecisionOutcome>;
  refetch: () => Promise<void>;
  handle: (out: DecisionOutcome) => void;
  onStart: () => void;
  onError: () => void;
  onSettled: () => void;
}): Promise<boolean> {
  if (opts.inFlight.current) return false;
  opts.inFlight.current = true;
  opts.onStart();
  try {
    const out = await opts.send();
    if (out.kind === "updated" || out.kind === "status_changed") await opts.refetch();
    opts.handle(out);
  } catch {
    opts.onError();
  } finally {
    opts.inFlight.current = false;
    opts.onSettled();
  }
  return true;
}
