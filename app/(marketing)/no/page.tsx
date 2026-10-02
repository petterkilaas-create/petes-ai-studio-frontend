import type { Metadata } from "next";
import { DEFAULT_BRAND } from "@/app/lib/brand";
import { MARKETING_HOME } from "@/app/lib/marketingAccess";
import { Examples } from "@/app/components/marketing/Examples";
import { Faq } from "@/app/components/marketing/Faq";
import { FinalCta } from "@/app/components/marketing/FinalCta";
import { Footer } from "@/app/components/marketing/Footer";
import { Hero } from "@/app/components/marketing/Hero";
import { Honest } from "@/app/components/marketing/Honest";
import { Labeling } from "@/app/components/marketing/Labeling";
import { MarketingTopBar } from "@/app/components/marketing/MarketingTopBar";
import { Moods } from "@/app/components/marketing/Moods";
import { Pricing } from "@/app/components/marketing/Pricing";
import { Services } from "@/app/components/marketing/Services";
import { Steps } from "@/app/components/marketing/Steps";
import { TrustStrip } from "@/app/components/marketing/TrustStrip";
import { fill } from "@/content/marketing/fill";
import { getFaq, getHome, getSite } from "@/content/marketing";
import { contentAnchors, visibleLinks } from "@/content/marketing/links";

// Markedssiden paa norsk (MS2): topplinjen og toppen. MS3a: tillitsstripen,
// eksemplene, stemningene, tre steg og tjenestene. MS3b: merkingen, den
// aerlige versjonen, prisene, spoersmaal og svar, siste knapp og bunnen.
// Rekkefoelgen er utkastets. Lenkene til ankre vises bare naar seksjonen
// finnes (links.ts); bunnen er med fordi den har #kontakt. Fast mappe no/
// (Petter 02.10); spraakversjonene kan flytte til [lang] senere.
// Serverkomponent, bygges statisk.
const site = getSite("no");
const home = getHome("no");
const faq = getFaq("no").filter((item) => item.showOnHome);
const brand = DEFAULT_BRAND;
const anchors = contentAnchors({ home, footer: site.footer });

// MS4: tittelen og beskrivelsen (ingressen i toppen) fra innholdet. Open
// Graph og Twitter arver tittel, beskrivelse og bilde (opengraph-image.tsx).
export const metadata: Metadata = {
  title: fill(site.seo.title, { brand: brand.displayName }),
  description: home.hero.lead,
  alternates: { canonical: MARKETING_HOME },
  openGraph: { type: "website", url: MARKETING_HOME, siteName: brand.displayName, locale: "nb_NO" },
  twitter: { card: "summary_large_image" },
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
        <Labeling labeling={home.labeling} site={site} />
        <Honest honest={home.honest} />
        <Pricing pricing={home.pricing} site={site} />
        <Faq block={home.faq} items={faq} site={site} />
        <FinalCta finalCta={home.finalCta} site={site} />
      </main>
      <Footer site={site} brand={brand} />
    </>
  );
}
