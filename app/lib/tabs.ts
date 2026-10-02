/**
 * Fanene paa markedssiden (MS3, WAI-ARIA «Tabs» med automatisk valg): ren
 * funksjon uten import, saa den kan testes med node --test.
 */

/**
 * Ny fane for en tast, eller null naar tasten ikke styrer fanene (da faar
 * nettleseren den, f.eks. Tab). Pil hoeyre og venstre gaar rundt, Home
 * gir den foerste og End den siste.
 */
export function tabKey(index: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
