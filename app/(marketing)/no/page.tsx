import type { Metadata } from "next";
import { DEFAULT_BRAND } from "@/app/lib/brand";
import { Examples } from "@/app/components/marketing/Examples";
import { Hero } from "@/app/components/marketing/Hero";
import { MarketingTopBar } from "@/app/components/marketing/MarketingTopBar";
import { Moods } from "@/app/components/marketing/Moods";
import { Services } from "@/app/components/marketing/Services";
import { Steps } from "@/app/components/marketing/Steps";
import { TrustStrip } from "@/app/components/marketing/TrustStrip";
import { fill } from "@/content/marketing/fill";
import { getHome, getSite } from "@/content/marketing";
import { contentAnchors, visibleLinks } from "@/content/marketing/links";

// Markedssiden paa norsk (MS2): topplinjen og toppen. MS3a: tillitsstripen,
// eksemplene, stemningene, tre steg og tjenestene, i utkastets rekkefoelge.
// Resten kommer i MS3b. Lenkene til ankre vises bare naar seksjonen finnes
// (links.ts). Fast mappe no/ (Petter 02.10); spraakversjonene kan flytte til
// [lang] senere. Serverkomponent, bygges statisk.
const site = getSite("no");
const home = getHome("no");
const brand = DEFAULT_BRAND;
const anchors = contentAnchors(home);

export const metadata: Metadata = {
  title: fill(site.seo.title, { brand: brand.displayName }),
};

export default function MarketingHome() {
  return (
    <>
      <MarketingTopBar site={site} brand={brand} links={visibleLinks(site.topBar.links, anchors)} />
      <main>
        <Hero hero={home.hero} site={site} />
        <TrustStrip strip={home.trustStrip} site={site} />
        <Examples examples={home.examples} site={site} />
        <Moods moods={home.moods} site={site} />
        <Steps steps={home.steps} />
        <Services services={home.services} site={site} />
      </main>
    </>
  );
}
