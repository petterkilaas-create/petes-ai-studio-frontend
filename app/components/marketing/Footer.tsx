import type { Brand } from "../../lib/brand";
import type { MaybeLink, Site } from "../../../content/marketing/schema";
import { BrandMark } from "../BrandMark";
import { PendingMark } from "./PendingMark";
import { TemplateText } from "./TemplateText";
import { CONTAINER, FOCUS } from "./classes";

/**
 * Bunnen (MS3b, utkastet linje 405-444): merket fra brand.ts, tjenestene,
 * trygghet, kontakt og ©. Sidene som ikke finnes ennaa (MS5), vises som
 * tekst uten lenke. Ingen spraakvelger foer det finnes flere spraak.
 * Ankeret (#kontakt) er maalet for «Snakk med oss».
 */
const LINK = `rounded-button text-ink no-underline hover:underline ${FOCUS}`;

function Item({ link }: { link: MaybeLink }) {
  if (link.href === undefined) return <span className="text-ink-2">{link.label}</span>;
  return (
    <a href={link.href} className={LINK}>
      {link.label}
    </a>
  );
}

export function Footer({ site, brand }: { site: Site; brand: Brand }) {
  const { footer, contact, offer } = site;
  return (
    <footer id={footer.anchor} className="border-t border-line bg-paper">
      <div className={`${CONTAINER} grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]`}>
        <div className="flex flex-col gap-3">
          <BrandMark brand={brand} alwaysShowName />
          <p className="m-0 text-[15px] text-ink-2">{footer.tagline}</p>
        </div>
        {footer.columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-2 text-[15px]">
            <p className="m-0 font-semibold text-ink">{col.title}</p>
            {col.links.map((l) => (
              <Item key={l.label} link={l} />
            ))}
          </nav>
        ))}
        <div className="flex flex-col gap-2 text-[15px]">
          <p className="m-0 font-semibold text-ink">{footer.contact.title}</p>
          {typeof contact.email === "string" ? (
            <a href={`mailto:${contact.email}`} className={LINK}>
              {contact.email}
            </a>
          ) : (
            <span>
              <PendingMark label={site.pendingLabels[contact.email.pending]} />
            </span>
          )}
          {footer.contact.links.map((l) => (
            <Item key={l.label} link={l} />
          ))}
        </div>
      </div>
      <div className={`${CONTAINER} flex flex-col gap-1 border-t border-line py-6 text-[13.5px] text-ink-2`}>
        <p className="m-0">
          <TemplateText
            template={footer.copyright}
            vars={{ year: offer.copyrightYear, companyName: footer.companyName }}
            site={site}
          />
        </p>
        <p className="m-0">{footer.note}</p>
      </div>
    </footer>
  );
}
