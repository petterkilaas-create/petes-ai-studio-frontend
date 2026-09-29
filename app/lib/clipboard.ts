/**
 * Kopiering til utklippstavlen med tilbakemelding (merking PR 2).
 * Utklippstavlen kan sendes inn, saa hjelperen kan testes uten nettleser.
 * Feiler kopieringen, markerer siden teksten saa brukeren kan kopiere selv
 * (document.execCommand("copy") er utdatert og brukes ikke).
 */

export type CopyResult = "copied" | "failed";

export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = globalThis.navigator?.clipboard
): Promise<CopyResult> {
  if (!clipboard || typeof clipboard.writeText !== "function") return "failed";
  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
