"use client";

import Link from "next/link";
import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Det en stengt side viser (TG-NEW-136, L0): en kort melding og lenke til
 * Express. Ingen kall mot backend, ingen jobber.
 */
export function ServiceUnavailable() {
  const locale = useLocale();

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans text-white">
      <main className="flex-1 flex flex-col items-center p-8 pt-20">
        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-16 text-center max-w-lg w-full">
          <p className="text-white font-bold text-lg mb-2">{t(locale, "unavailable.title")}</p>
          <p className="text-slate-400 text-sm mb-8">{t(locale, "unavailable.body")}</p>
          <Link
            href="/express"
            className="inline-block px-6 py-3 bg-[#009183] hover:bg-[#00b09f] text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors shadow-[0_0_15px_rgba(0,145,131,0.3)] focus:outline-none focus:ring-2 focus:ring-[#009183] focus:ring-offset-2 focus:ring-offset-[#0B1120]"
          >
            {t(locale, "unavailable.toExpress")}
          </Link>
        </div>
      </main>
    </div>
  );
}
