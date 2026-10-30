import { parseFrom } from "./orderTabs.ts";
import { ORDERS_PATH } from "./services.ts";

/**
 * Hvilken lenke i menyen som er markert (AppNav). Ren funksjon, saa den
 * testes med node --test.
 *
 * Godkjenningssiden hoerer til Historikk (dit «Tilbake» gaar), men med en
 * gyldig `?fra=<ordre>` (FE-3c) hoerer den til Ordrer (FE-4, Petter 30.10).
 */
export function isNavActive(href: string, pathname: string, from: string | null = null): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (!pathname.startsWith("/godkjenning/")) return false;
  return parseFrom(from) === null ? href === "/history" : href === ORDERS_PATH;
}
