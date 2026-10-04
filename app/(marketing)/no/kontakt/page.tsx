import type { Metadata } from "next";
import { DEFAULT_BRAND } from "@/app/lib/brand";
import { CONTACT_PATH } from "@/app/lib/marketingAccess";
import { ContactPage } from "@/app/components/marketing/ContactPage";
import { PageIntro } from "@/app/components/marketing/PageIntro";
import { Subpage } from "@/app/components/marketing/Subpage";
import { fill } from "@/content/marketing/fill";
import { getContactPage, getHome, getSite } from "@/content/marketing";

// Kontaktsiden (MS5a): e-post og selskapsnavn venter (site). Ikke noe skjema.
// Serverkomponent, bygges statisk. noindex og delingsbildet arves fra
// layouten og /no.
const site = getSite("no");
const home = getHome("no");
const page = getContactPage("no");
const brand = DEFAULT_BRAND;

// Uten openGraph og twitter: da arves delingsbildet fra /no, og Next lager
// og:title, og:description og twitter:card av tittelen og beskrivelsen. Med
// openGraph her ville hele objektet, ogsaa bildet, blitt erstattet (sjekket i
// build 04.10).
export const metadata: Metadata = {
  title: fill(page.seo.title, { brand: brand.displayName }),
  description: fill(page.seo.description, { brand: brand.displayName }),
  alternates: { canonical: CONTACT_PATH },
};

export default function ContactRoute() {
  return (
    <Subpage site={site} home={home} brand={brand}>
      <PageIntro title={page.title} lead={page.lead} vars={{}} site={site} />
      <ContactPage page={page} site={site} />
    </Subpage>
  );
}
