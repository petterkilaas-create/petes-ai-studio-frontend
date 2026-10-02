import type { Brand } from "../lib/brand";

/**
 * Merket oeverst i skallet: foretakets logo, eller standardmerkets ikon, og
 * visningsnavnet ved siden av. Alt kommer fra merket (brand.ts), ingenting
 * skrives rett inn her. Ikonet tegnes med currentColor, saa det faar samme
 * farge som navnet. Uten logo og ikon vises bare navnet, ogsaa paa smal skjerm.
 */
export function BrandMark({ brand }: { brand: Brand }) {
  const { url, icon } = brand.logo;
  const hasMark = Boolean(url || icon);

  return (
    <span className="flex items-center gap-2.5 text-ink">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-9 w-auto" />
      ) : icon ? (
        <svg
          aria-hidden
          width="26"
          height="26"
          viewBox={icon.viewBox}
          fill="none"
          stroke="currentColor"
          strokeWidth={icon.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          {icon.paths.map((d) => (
            <path key={d} d={d} />
          ))}
          {icon.circles.map((c) => (
            <circle key={`${c.cx},${c.cy},${c.r}`} cx={c.cx} cy={c.cy} r={c.r} />
          ))}
        </svg>
      ) : null}
      <span className={`${hasMark ? "sr-only sm:not-sr-only " : ""}font-display text-[26px] leading-none tracking-[-0.01em]`}>
        {brand.displayName}
      </span>
    </span>
  );
}
