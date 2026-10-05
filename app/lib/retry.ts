/**
 * Nye forsoek ved kaldstart (TG-NEW-134). Cloud Run staar med min 0
 * instanser, og det foerste kallet etter en pause kan feile foer appen er
 * oppe: nettleseren ser da `TypeError: Failed to fetch` (svaret fra Googles
 * frontlag har ingen CORS-headere), eller 502, 503 eller 504.
 *
 * Bare GET proeves paa nytt. POST proeves aldri automatisk. 4xx og 500 er
 * svar fra appen og proeves ikke paa nytt her.
 *
 * Ren modul uten import, saa den kan testes med node --test. Ventingen gaar
 * gjennom `retryClock.sleep`, som testene bytter ut.
 */

/** Pausene mellom forsoekene for GET: 20 s til sammen, sju forsoek. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 3000, 4000, 5000, 5000];

/** Pausene i pollingen ved TransientError (afterPoll): 20 s til sammen. */
export const POLL_TRANSIENT_DELAYS_MS: readonly number[] = [2000, 4000, 6000, 8000];

const RETRY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRY_STATUSES.has(status);
}

/** fetch kaster TypeError naar svaret ikke kan leses (nettverk eller CORS). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

/**
 * Feil som kan gaa over av seg selv: nettverksfeil (httpStatus null) eller
 * 502, 503 og 504. pollJob kaster den, og afterPoll gir den lengre tid.
 */
export class TransientError extends Error {
  readonly httpStatus: number | null;

  constructor(httpStatus: number | null, message: string) {
    super(message);
    this.name = "TransientError";
    this.httpStatus = httpStatus;
  }
}

export const retryClock = {
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Kjoerer en GET og proever paa nytt ved nettverksfeil eller 502, 503 og
 * 504, med pausene i RETRY_DELAYS_MS. Etter siste forsoek kommer det
 * vanlige svaret eller den vanlige feilen. `onRetry` kalles foer hver pause,
 * saa siden kan vise at den venter.
 */
export async function getWithRetry(
  doFetch: () => Promise<Response>,
  opts: { onRetry?: () => void } = {}
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= RETRY_DELAYS_MS.length;
    try {
      const res = await doFetch();
      if (last || !isRetryableStatus(res.status)) return res;
    } catch (err) {
      if (last || !isNetworkError(err)) throw err;
    }
    opts.onRetry?.();
    await retryClock.sleep(RETRY_DELAYS_MS[attempt]);
  }
}
