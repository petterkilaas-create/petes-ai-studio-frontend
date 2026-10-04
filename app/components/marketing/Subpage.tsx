import type { Brand } from "../../lib/brand";
import { MARKETING_HOME } from "../../lib/marketingAccess";
import { fill } from "../../../content/marketing/fill";
import { contentAnchors, onPage, visibleLinks } from "../../../content/marketing/links";
import type { Home, Site } from "../../../content/marketing/schema";
import { Footer } from "./Footer";
import { MarketingTopBar } from "./MarketingTopBar";
import { CONTAINER } from "./classes";

/**
 * Skallet paa en innholdsside (MS5a): topplinjen og bunnen som paa
 * forsiden, men merket gaar til /no, og lenkene til seksjoner gaar til
 * forsidens ankre («/no#priser»). Ankrene er forsidens, saa en lenke vises
 * bare naar seksjonen finnes der. «Logg inn» og «Prøv gratis» er uendret.
 */
export function Subpage({
  site,
  home,
  brand,
  children,
}: {
  site: Site;
  home: Home;
  brand: Brand;
  children: React.ReactNode;
}) {
  const anchors = contentAnchors({ home, footer: site.footer });
  const logo = { href: MARKETING_HOME, label: fill(site.topBar.logoHomeLabel, { brand: brand.displayName }) };
  return (
    <>
      <MarketingTopBar
        site={site}
        brand={brand}
        links={onPage(visibleLinks(site.topBar.links, anchors), MARKETING_HOME)}
        logo={logo}
      />
      <main className={`${CONTAINER} flex max-w-[880px] flex-col gap-12 py-[clamp(40px,6vw,80px)]`}>{children}</main>
      <Footer site={site} brand={brand} homePath={MARKETING_HOME} />
    </>
  );
}
