import "./globals.css";
import type { Metadata } from "next";
import { BrandMark } from "./components/BrandMark";
import { FOCUS } from "./components/marketing/classes";
import { brandCssVars, DEFAULT_BRAND } from "./lib/brand";
import { fontVariables } from "./lib/fonts";
import { fill } from "../content/marketing/fill";
import { getSite } from "../content/marketing";

// Norsk 404 for adresser som ikke finnes (MS2). Med to rot-layouter ((app)
// og (marketing)) trengs global-not-found, som krever flagget
// experimental.globalNotFound i next.config.ts (not-found.md:45-72). Siden
// rendres uten layout, saa den henter globals.css og fontene selv. Next
// legger paa noindex. Uten Clerk; teksten kommer fra innholdet.
const { notFound } = getSite("no");
const brand = DEFAULT_BRAND;

export const metadata: Metadata = {
  title: fill(notFound.pageTitle, { brand: brand.displayName }),
};

const LINK = `inline-flex min-h-11 items-center justify-center rounded-button px-5 text-sm font-medium no-underline ${FOCUS}`;

export default function GlobalNotFound() {
  return (
    <html lang="nb" className={fontVariables} style={brandCssVars(brand) as React.CSSProperties}>
      <body className="min-h-screen">
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-start justify-center gap-6 px-4 py-16">
          <BrandMark brand={brand} />
          <h1 className="m-0 font-display text-[40px] font-normal leading-[1.05] text-ink md:text-[56px]">
            {notFound.title}
          </h1>
          <p className="m-0 text-base leading-relaxed text-ink-2">{notFound.text}</p>
          <div className="flex flex-wrap gap-3">
            <a href={notFound.toApp.href} className={`${LINK} bg-primary text-on-primary hover:opacity-90`}>
              {notFound.toApp.label}
            </a>
            <a href={notFound.toHome.href} className={`${LINK} border border-line-strong bg-surface text-ink hover:bg-surface-2`}>
              {notFound.toHome.label}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
