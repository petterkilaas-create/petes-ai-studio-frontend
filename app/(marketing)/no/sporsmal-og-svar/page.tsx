import type { Metadata } from "next";
import { DEFAULT_BRAND } from "@/app/lib/brand";
import { FAQ_PATH } from "@/app/lib/marketingAccess";
import { FaqList } from "@/app/components/marketing/FaqList";
import { PageIntro } from "@/app/components/marketing/PageIntro";
import { Subpage } from "@/app/components/marketing/Subpage";
import { FOCUS } from "@/app/components/marketing/classes";
import { fill } from "@/content/marketing/fill";
import { getFaq, getFaqPage, getHome, getSite } from "@/content/marketing";

// Spoersmaalssiden (MS5a): alle spoersmaalene i faq.ts (forsiden viser bare
// showOnHome), og lenkene til de andre hjelpesidene oeverst (site.help).
// Serverkomponent, bygges statisk. noindex og delingsbildet arves fra
// layouten og /no.
const site = getSite("no");
const home = getHome("no");
const page = getFaqPage("no");
const faq = getFaq("no");
const brand = DEFAULT_BRAND;
const related = site.help.links.filter((l) => l.href !== FAQ_PATH);

// Uten openGraph og twitter: da arves delingsbildet fra /no, og Next lager
// og:title, og:description og twitter:card av tittelen og beskrivelsen. Med
// openGraph her ville hele objektet, ogsaa bildet, blitt erstattet (sjekket i
// build 04.10).
export const metadata: Metadata = {
  title: fill(page.seo.title, { brand: brand.displayName }),
  description: fill(page.seo.description, { brand: brand.displayName }),
  alternates: { canonical: FAQ_PATH },
};

export default function FaqPage() {
  return (
    <Subpage site={site} home={home} brand={brand}>
      <PageIntro title={page.title} lead={page.lead} vars={{ email: site.contact.email }} site={site} />
      <nav aria-label={site.help.title} className="flex flex-wrap gap-x-6 gap-y-2">
        {related.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className={`flex min-h-11 items-center rounded-button text-[16px] font-medium text-ink underline underline-offset-4 ${FOCUS}`}
          >
            {l.label}
          </a>
        ))}
      </nav>
      <FaqList items={faq} site={site} />
    </Subpage>
  );
}
