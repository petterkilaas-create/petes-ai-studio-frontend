"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, FolderOpen, History, PenLine, Sofa, Zap, type LucideIcon } from "lucide-react";
import { navLinks, type NavId } from "../lib/services";
import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Menyen i skallet (D1): Lucide-ikoner i stedet for emoji, tekst fra
 * ordlista og aktiv side markert (aria-current). Lenkene og hvilke som vises,
 * kommer fra navLinks() i lib/services.ts.
 */
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
    </nav>
  );
}
