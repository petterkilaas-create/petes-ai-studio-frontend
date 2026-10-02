import { ImageResponse } from "next/og";
import { DEFAULT_BRAND, PAPER, type Brand } from "@/app/lib/brand";
import { fill } from "@/content/marketing/fill";
import { getHome, getSite } from "@/content/marketing";
import type { Hero } from "@/content/marketing/schema";

// Delingsbildet for /no (MS4): merket, linja over overskriften og
// overskriften fra innholdet, i fargene fra merket. Uten foto til
// eksempelbildene er klare (originalen er laget med AI). Fonten er Geist,
// som next/og har med seg (Petter 02.10, valg A1). Bygges statisk.
const site = getSite("no");
const { hero } = getHome("no");
const brand = DEFAULT_BRAND;

export const alt = fill(site.seo.ogImageAlt, { brand: brand.displayName, title: hero.title });
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Card({ brand, hero }: { brand: Brand; hero: Hero }) {
  const ink = brand.colors.primary;
  const icon = brand.logo.icon;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: PAPER,
        color: ink,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 44 }}>
        {icon && (
          <svg
            width="64"
            height="64"
            viewBox={icon.viewBox}
            fill="none"
            stroke={ink}
            strokeWidth={icon.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon.paths.map((d) => (
              <path key={d} d={d} />
            ))}
            {icon.circles.map((c) => (
              <circle key={`${c.cx},${c.cy},${c.r}`} cx={c.cx} cy={c.cy} r={c.r} />
            ))}
          </svg>
        )}
        {brand.displayName}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 32, opacity: 0.7 }}>{hero.eyebrow}</div>
        <div style={{ display: "flex", fontSize: 84, lineHeight: 1.05, letterSpacing: -2 }}>{hero.title}</div>
      </div>
    </div>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(<Card brand={brand} hero={hero} />, size);
}
