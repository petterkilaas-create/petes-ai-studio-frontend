import type { Metadata } from "next";
import { DEFAULT_BRAND } from "@/app/lib/brand";
import { GUIDE_PATH } from "@/app/lib/marketingAccess";
import { GuidePage } from "@/app/components/marketing/GuidePage";
import { PageIntro } from "@/app/components/marketing/PageIntro";
import { Subpage } from "@/app/components/marketing/Subpage";
import { fill } from "@/content/marketing/fill";
import { getGuidePage, getHome, getSite } from "@/content/marketing";

// Veiledningen (Dag 59): ordren fra ny ordre til nedlasting, for meglere.
// Serverkomponent, bygges statisk. noindex og delingsbildet arves fra
// layouten og /no.
const site = getSite("no");
const home = getHome("no");
const page = getGuidePage("no");
const brand = DEFAULT_BRAND;

// Uten openGraph og twitter: da arves delingsbildet fra /no, og Next lager
// og:title, og:description og twitter:card av tittelen og beskrivelsen. Med
// openGraph her ville hele objektet, ogsaa bildet, blitt erstattet (sjekket i
// build 04.10).
export const metadata: Metadata = {
  title: fill(page.seo.title, { brand: brand.displayName }),
  description: fill(page.seo.description, { brand: brand.displayName }),
  alternates: { canonical: GUIDE_PATH },
};

export default function GuideRoute() {
  return (
    <Subpage site={site} home={home} brand={brand}>
      <PageIntro title={fill(page.title, { brand: brand.displayName })} lead={page.lead} vars={{}} site={site} />
      <GuidePage page={page} />
    </Subpage>
  );
}
