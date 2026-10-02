import { BrandMark } from "../BrandMark";
import type { Brand } from "../../lib/brand";
import { fill } from "../../../content/marketing/fill";
import type { Link, Site } from "../../../content/marketing/schema";
import { MobileMenu } from "./MobileMenu";
import { CONTAINER, FOCUS } from "./classes";

/**
 * Topplinjen paa markedssiden (MS2, utkastet linje 26-40): merket, lenkene
 * til seksjonene, «Logg inn» og «Prøv gratis». All tekst kommer fra
 * innholdet, og merket fra brand.ts via BrandMark. Under 820 px skjules
 * bare menylenkene; «Logg inn» og «Prøv gratis» vises alltid (Petter
 * 02.10). Vanlige <a>: lenkene gaar til ankre eller til appen (annen
 * rot-layout, full sidelast uansett).
 *
 * MS3: `links` er bare lenkene til seksjoner som finnes (visibleLinks i
 * content/marketing/links.ts), og under 820 px ligger de i MobileMenu.
 */
const NAV_LINK = `flex h-11 items-center rounded-[8px] px-3.5 text-[15px] font-medium text-ink no-underline hover:text-ink-2 ${FOCUS}`;

export function MarketingTopBar({ site, brand, links }: { site: Site; brand: Brand; links: Link[] }) {
  const { topBar, cta } = site;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className={`${CONTAINER} flex h-[68px] items-center justify-between gap-6`}>
        <a
          href={topBar.logoHref}
          aria-label={fill(topBar.logoLabel, { brand: brand.displayName })}
          className={`flex min-h-11 items-center rounded-button no-underline ${FOCUS}`}
        >
          <BrandMark brand={brand} />
        </a>
        <nav aria-label={topBar.navLabel} className="hidden items-center gap-0.5 min-[820px]:flex">
          {links.map((l: Link) => (
            <a key={l.href} href={l.href} className={NAV_LINK}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <MobileMenu label={topBar.menuLabel} navLabel={topBar.navLabel} links={links} />
          <a href={topBar.login.href} className={`${NAV_LINK} rounded-button`}>
            {topBar.login.label}
          </a>
          <a
            href={cta.href}
            className={`flex h-11 items-center whitespace-nowrap rounded-button bg-primary px-[18px] text-[15px] font-semibold text-on-primary no-underline hover:opacity-90 ${FOCUS}`}
          >
            {cta.label}
          </a>
        </div>
      </div>
    </header>
  );
}
