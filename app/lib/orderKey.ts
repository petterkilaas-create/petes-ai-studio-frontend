/**
 * `Idempotency-Key` for POST /v1/process (TG-NEW-149, Petter 04.10 valg 2A).
 *
 * Én noekkel per bestilling. Et nytt klikk paa «Lag bilde» med samme bilde,
 * tjeneste og valg etter et forsoek som ikke fikk 202, er et nytt forsoek av
 * SAMME bestilling og faar samme noekkel: da trekker backend aldri to ganger
 * om det foerste kallet egentlig kom fram. Et 202-svar, en endring eller
 * «Start paa nytt» gir ny noekkel.
 *
 * Ren modul uten runtime-importer (node --test).
 */

export interface OrderInput {
  file: File;
  service: string;
  params?: unknown;
}

interface Pending {
  file: File;
  service: string;
  paramsJson: string;
  key: string;
}

export class OrderKeys {
  private pending: Pending | null = null;
  private readonly newKey: () => string;

  constructor(newKey: () => string = () => crypto.randomUUID()) {
    this.newKey = newKey;
  }

  /** Noekkelen for denne bestillingen: samme ved nytt forsoek, ellers ny. */
  keyFor(order: OrderInput): string {
    const paramsJson = JSON.stringify(order.params ?? {});
    const p = this.pending;
    if (p !== null && p.file === order.file && p.service === order.service && p.paramsJson === paramsJson) {
      return p.key;
    }
    const key = this.newKey();
    this.pending = { file: order.file, service: order.service, paramsJson, key };
    return key;
  }

  /** Bestillingen er mottatt (202/200): neste klikk er en ny bestilling. */
  accepted(): void {
    this.pending = null;
  }

  /** «Start paa nytt» og bytte av verktoey. */
  clear(): void {
    this.pending = null;
  }
}
