import "./globals.css";
import type { Metadata } from "next";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Geist, Instrument_Serif } from "next/font/google";
import { AppNav } from "./components/AppNav";
import { brandCssVars, DEFAULT_BRAND } from "./lib/brand";

// Fontene lastes ned ved bygg og serveres fra oss (D0), og er i bruk fra D1:
// font-ui paa body (globals.css), font-display paa titler fra 28 px. Bare
// .variable paa <html>, aldri .className.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument-serif",
});

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

// Merket per foretak kommer med TG-NEW-128 (via resolveBrand).
const brand = DEFAULT_BRAND;

// Fanetittel: visningsnavnet, og «Side · navn» der ruten har egen tittel
// (express/, history/ og godkjenning/ har en liten layout.tsx).
export const metadata: Metadata = {
  title: { default: brand.displayName, template: `%s · ${brand.displayName}` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="no" className={`${instrumentSerif.variable} ${geist.variable}`} style={brandCssVars(brand) as React.CSSProperties}>
        <body className="min-h-screen">
          <header className="sticky top-0 z-[100] border-b border-line bg-surface/95 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
              <div className="flex min-w-0 items-center gap-2 md:gap-6">
                <Link
                  href="/"
                  className="flex min-h-11 shrink-0 items-center gap-3 rounded-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {brand.logo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.logo.url} alt="" className="h-9 w-auto" />
                  ) : (
                    <span aria-hidden className="flex size-9 items-center justify-center rounded-button bg-primary font-display text-xl text-on-primary">
                      {brand.logo.monogram}
                    </span>
                  )}
                  <span className="sr-only sm:not-sr-only text-[15px] font-medium text-ink">{brand.displayName}</span>
                </Link>
                <AppNav />
              </div>
              <UserButton />
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
