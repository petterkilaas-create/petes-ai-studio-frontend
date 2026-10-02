/**
 * Hvem som kommer til markedssiden og hvor `/` sender (MS2, Petter 02.10).
 * Rene data og funksjoner uten import, saa proxy.ts og testene bruker samme
 * kode (node --test).
 *
 * MARKETING_PUBLIC er false til lansering: bildene er midlertidige, utkastet
 * har plassholdere, og vercel.app-adressen skal ikke indekseres. Da er
 * markedssiden bak innlogging og har noindex, og `/` gaar til innlogging og
 * deretter til /start.
 *
 * Lansering (egen PR): sett MARKETING_PUBLIC til true OG ta /no ut av
 * matcheren i proxy.ts. Matcheren maa vaere en fast verdi (proxy.md:132), saa
 * den kan ikke leses herfra. design-testen (marketing.test.ts) sjekker at de
 * to henger sammen.
 */

export const MARKETING_PUBLIC: boolean = false;

/** Startsiden for innloggede. */
export const START_PATH = "/start";

/** Markedssiden paa norsk. Uten skraastrek til slutt (trailingSlash er av). */
export const MARKETING_HOME = "/no";

/** `/no` og alt under `/no/`. Ikke `/nokke` eller `/no-x`. */
export function isMarketingPath(pathname: string): boolean {
  return pathname === MARKETING_HOME || pathname.startsWith(`${MARKETING_HOME}/`);
}

/**
 * Hvor `/` sender: innloggede til /start. Andre til markedssiden naar den er
 * offentlig, ellers null (da beskytter proxyen `/` som foer, og innloggingen
 * sender tilbake til `/` og videre til /start).
 */
export function rootTarget(signedIn: boolean, marketingPublic: boolean = MARKETING_PUBLIC): string | null {
  if (signedIn) return START_PATH;
  return marketingPublic ? MARKETING_HOME : null;
}

/**
 * Om proxyen skal slippe en side gjennom uten innlogging (i tillegg til
 * sign-in og sign-up). Bare markedssidene, og bare naar de er offentlige.
 */
export function isOpenMarketingPath(pathname: string, marketingPublic: boolean = MARKETING_PUBLIC): boolean {
  return marketingPublic && isMarketingPath(pathname);
}
