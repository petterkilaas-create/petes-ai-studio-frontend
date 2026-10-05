import "@/app/globals.css";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { AccountMenu } from "@/app/components/AccountMenu";
import { AppNav } from "@/app/components/AppNav";
import { BrandMark } from "@/app/components/BrandMark";
import { brandCssVars, DEFAULT_BRAND } from "@/app/lib/brand";
import { fontVariables } from "@/app/lib/fonts";
import { LOCALE_COOKIE, resolveLocale } from "@/app/lib/i18n/locale";
import { LocaleProvider } from "@/app/lib/i18n/LocaleProvider";
import { START_PATH } from "@/app/lib/marketingAccess";

// Merket per foretak kommer med TG-NEW-128 (via resolveBrand).
const brand = DEFAULT_BRAND;

// Fanetittel: visningsnavnet, og «Side · navn» der ruten har egen tittel
// (start/, tjenester/, history/ og godkjenning/ har en liten layout.tsx). Ikonene er
// filene icon.svg og apple-icon.png i app/ (husikonet fra brand.ts).
// MS4: app-sidene skal aldri indekseres (i tillegg til innloggingen).
export const metadata: Metadata = {
  title: { default: brand.displayName, template: `%s · ${brand.displayName}` },
  robots: { index: false, follow: false },
};

// TG-NEW-129: spraaket fra cookien (brukerens valg), ellers nettleserens
// Accept-Language. cookies() og headers() gjoer app-sidene dynamiske; det er
// greit bak innloggingen (Petter 05.10). Markedssiden har egen rot-layout og
// forblir statisk.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });

  return (
    <ClerkProvider>
      <html lang={locale} className={fontVariables} style={brandCssVars(brand) as React.CSSProperties}>
        <body className="min-h-screen">
          <LocaleProvider locale={locale}>
            <header className="sticky top-0 z-[100] border-b border-line bg-surface/95 backdrop-blur">
              <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
                <div className="flex min-w-0 items-center gap-2 md:gap-6">
                  <Link
                    href={START_PATH}
                    className="flex min-h-11 shrink-0 items-center gap-3 rounded-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    <BrandMark brand={brand} />
                  </Link>
                  <AppNav />
                </div>
                <AccountMenu />
              </div>
            </header>
            {children}
          </LocaleProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
