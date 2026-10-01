import "./globals.css";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Fragment } from "react";
import { Geist, Instrument_Serif } from "next/font/google";
import { navLinks } from "./lib/services";
import { brandCssVars, DEFAULT_BRAND } from "./lib/brand";

// D0: fontene lastes ned ved bygg og serveres fra oss, men tas ikke i bruk
// ennaa (D1). Bare .variable paa <html>, aldri .className (bytter font).
// preload: false til de brukes, ellers advarer nettleseren.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-instrument-serif",
});

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-geist",
});

// Merket per foretak kommer med TG-NEW-128 (via resolveBrand).
const brand = DEFAULT_BRAND;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="no" className={`${instrumentSerif.variable} ${geist.variable}`} style={brandCssVars(brand) as React.CSSProperties}>
        <body className="bg-[#0B1120] text-white min-h-screen overflow-y-auto">
          <header className="sticky top-0 z-[100] bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5 px-8 py-4 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 bg-[#0B1120] border border-[#009183]/50 rounded-lg flex items-center justify-center font-black text-[#009183] text-sm group-hover:bg-[#009183] group-hover:text-white transition-colors">{brand.logo.monogram}</div>
                <span className="font-black text-white uppercase tracking-widest hidden md:block text-xs">{brand.displayName}</span>
              </Link>
              <nav className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {navLinks().map((l) => (
                  <Fragment key={l.href}>
                    {l.dividerBefore && <div className="w-px h-4 bg-slate-700"></div>}
                    <Link href={l.href} className={l.className}>{l.label}</Link>
                  </Fragment>
                ))}
              </nav>
            </div>
            <UserButton />
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
