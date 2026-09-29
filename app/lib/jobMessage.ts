import type { Message } from "./i18n";

/**
 * Kort melding til megleren for en jobb (TG-NEW-121), ut fra status og
 * `code` fra backend. Aldri ut fra `error`-teksten: den er teknisk (JSON,
 * fal-URL) og finnes bare i loggene og paa /scene-transform-debug.
 * Ren funksjon med bare type-importer, saa den kan testes med node --test.
 *
 * - needs_review: koden fra port 1 via ordlista (ukjent/tom gir generisk).
 * - failed + rejected_by_reviewer: «Avvist av deg».
 * - failed ellers (teknisk feil, ogsaa uten kode): generisk melding.
 * - rejected (scene-gate): generisk melding.
 * - alle andre statuser: ingen melding (null).
 */
export function jobMessage(status: string, code: unknown): Message | null {
  switch (status) {
    case "needs_review":
      return { group: "reviewCode", code };
    case "failed":
      return code === "rejected_by_reviewer"
        ? { key: "status.rejectedByYou" }
        : { key: "job.failed" };
    case "rejected":
      return { key: "job.rejected" };
    default:
      return null;
  }
}
