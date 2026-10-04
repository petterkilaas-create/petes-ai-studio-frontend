"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, Clapperboard, FolderOpen, History, PenLine, Sofa, Zap, type LucideIcon } from "lucide-react";
import { navLinks, type NavId } from "../lib/services";
import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";
import { site } from "../../content/marketing/nb/site";

/**
 * Menyen i skallet (D1): Lucide-ikoner i stedet for emoji, tekst fra
 * ordlista og aktiv side markert (aria-current). Lenkene og hvilke som vises,
 * kommer fra navLinks() i lib/services.ts.
 *
 * MS5a (valg B): «Hjelp» gaar til den foerste hjelpesiden i site.help, den
 * samme lista bunnen paa markedssiden bruker; AppNav har ingen egne
 * adresser. Ordet er fra ordlista, saa det foelger appens spraak (sidene
 * finnes bare paa norsk). Under 640 px bare ikonet, og ordet for
 * skjermlesere. Vanlig <a>: markedssidene har egen rot-layout (full sidelast).
 */
const HELP_HREF = site.help.links[0].href;
const ICONS: Record<NavId, LucideIcon> = {
  express: Zap,
  staging: Sofa,
  video: Clapperboard,
  copywriter: PenLine,
  orders: FolderOpen,
  history: History,
};

/** Godkjenningssiden hoerer til Historikk (dit «Tilbake» gaar). */
function isActive(href: string, pathname: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  return href === "/history" && pathname.startsWith("/godkjenning/");
}

export function AppNav() {
  const pathname = usePathname() ?? "";
  const locale = useLocale();

  return (
    <nav aria-label={t(locale, "nav.label")} className="flex items-center gap-1">
      {navLinks().map((l) => {
        const Icon = ICONS[l.id];
        const active = isActive(l.href, pathname);
        return (
          <span key={l.href} className="flex items-center gap-1">
            {l.dividerBefore && <span aria-hidden className="mx-1 h-5 w-px bg-line" />}
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-button px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon aria-hidden className="size-4" strokeWidth={1.75} />
              {t(locale, `nav.${l.id}`)}
            </Link>
          </span>
        );
      })}
      <a
        href={HELP_HREF}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-button px-3 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <CircleHelp aria-hidden className="size-4" strokeWidth={1.75} />
        <span className="sr-only sm:not-sr-only">{t(locale, "nav.help")}</span>
      </a>
    </nav>
  );
}
