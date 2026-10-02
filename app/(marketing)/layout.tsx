import "@/app/globals.css";
import type { Metadata } from "next";
import { brandCssVars, DEFAULT_BRAND } from "@/app/lib/brand";
import { fontVariables } from "@/app/lib/fonts";
import { MARKETING_PUBLIC, SITE_URL } from "@/app/lib/marketingAccess";

// Rot-layouten til markedssiden (MS2). Uten ClerkProvider og uten
// app-headeren, saa Clerk-skriptet ikke lastes her (AUDIT_MARKEDSSIDE §3).
// Fontene og tokenene er de samme som i appen. Merket er alltid
// standardmerket (DEFAULT_BRAND), aldri et foretak.
//
// Til lansering (MARKETING_PUBLIC false) skal siden ikke indekseres.
// MS4: metadataBase gjoer canonical, og:url og delingsbildet til fulle
// adresser paa SITE_URL. Sidene setter ikke robots selv (metadata slaas
// sammen grunt, generate-metadata.md:1326).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  robots: MARKETING_PUBLIC ? undefined : { index: false, follow: false },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className={fontVariables} style={brandCssVars(DEFAULT_BRAND) as React.CSSProperties}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
