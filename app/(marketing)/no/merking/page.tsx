import type { Metadata } from "next";
import { DEFAULT_BRAND } from "@/app/lib/brand";
import { LABELING_PATH } from "@/app/lib/marketingAccess";
import { LabelingPage } from "@/app/components/marketing/LabelingPage";
import { PageIntro } from "@/app/components/marketing/PageIntro";
import { Subpage } from "@/app/components/marketing/Subpage";
import { fill } from "@/content/marketing/fill";
import { getFaq, getHome, getLabelingPage, getSite } from "@/content/marketing";

// Merkesiden (MS5a): merket i bildet, teksten til annonsen og fila.
// Serverkomponent, bygges statisk. noindex og delingsbildet arves fra
// layouten og /no.
const site = getSite("no");
const home = getHome("no");
const page = getLabelingPage("no");
const faq = getFaq("no");
const brand = DEFAULT_BRAND;

// Uten openGraph og twitter: da arves delingsbildet fra /no, og Next lager
// og:title, og:description og twitter:card av tittelen og beskrivelsen. Med
// openGraph her ville hele objektet, ogsaa bildet, blitt erstattet (sjekket i
// build 04.10).
export const metadata: Metadata = {
  title: fill(page.seo.title, { brand: brand.displayName }),
  description: fill(page.seo.description, { brand: brand.displayName }),
  alternates: { canonical: LABELING_PATH },
};

export default function LabelingRoute() {
  return (
    <Subpage site={site} home={home} brand={brand}>
      <PageIntro title={page.title} lead={page.lead} vars={{ brand: brand.displayName }} site={site} />
      <LabelingPage page={page} home={home} faq={faq} site={site} />
    </Subpage>
  );
}
