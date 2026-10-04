import type { ContactPage as ContactPageContent, Site } from "../../../content/marketing/schema";
import { PendingMark } from "./PendingMark";
import { TemplateText } from "./TemplateText";
import { H2_PAGE } from "./TextSection";
import { FOCUS } from "./classes";

/**
 * Kontaktsiden (MS5a): hvem som tar kontakt om hva, og selskapet. E-posten
 * og selskapsnavnet er fra site (contact.email og footer.companyName) og
 * vises med merkelapp til de er avklart. Ikke noe skjema (det krever backend).
 */
export function ContactPage({ page, site }: { page: ContactPageContent; site: Site }) {
  const company = site.footer.companyName;
  return (
    <>
      {page.groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h2 className={H2_PAGE}>{group.title}</h2>
          <p className="m-0 max-w-[40em] text-[17px] leading-[1.6] text-ink">
            <TemplateText template={group.text} vars={{ email: site.contact.email }} site={site} />
          </p>
          {group.more && (
            <a
              href={group.more.href}
              className={`flex min-h-11 items-center self-start rounded-button text-[16px] font-medium text-ink underline underline-offset-4 ${FOCUS}`}
            >
              {group.more.label}
            </a>
          )}
        </section>
      ))}
      <section className="flex flex-col gap-3">
        <h2 className={H2_PAGE}>{page.companyTitle}</h2>
        <p className="m-0 text-[17px] leading-[1.6] text-ink">
          {typeof company === "string" ? company : <PendingMark label={site.pendingLabels[company.pending]} />}
        </p>
      </section>
    </>
  );
}
