import type { Metadata } from "next";
import { DEFAULT_BRAND } from "@/app/lib/brand";
import { Hero } from "@/app/components/marketing/Hero";
import { MarketingTopBar } from "@/app/components/marketing/MarketingTopBar";
import { fill } from "@/content/marketing/fill";
import { getHome, getSite } from "@/content/marketing";

// Markedssiden paa norsk (MS2): topplinjen og toppen. Resten av seksjonene og
// bunnen kommer i MS3. Fast mappe no/ (Petter 02.10); spraakversjonene kan
// flytte til [lang] senere. Serverkomponent, bygges statisk.
const site = getSite("no");
const home = getHome("no");
const brand = DEFAULT_BRAND;

export const metadata: Metadata = {
  title: fill(site.seo.title, { brand: brand.displayName }),
};

export default function MarketingHome() {
  return (
    <>
      <MarketingTopBar site={site} brand={brand} />
      <main>
        <Hero hero={home.hero} site={site} />
      </main>
    </>
  );
}
