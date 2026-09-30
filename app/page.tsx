"use client";

import { useUser, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { isPageEnabled, STAGING_PATH, VIDEO_PATH } from "./lib/services";
import { t } from "./lib/i18n";
import { useLocale } from "./lib/i18n/useLocale";

export default function Home() {
  const { user } = useUser();
  const locale = useLocale();

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans">

      {/* HERO SECTION */}
      <main className="flex-1 flex flex-col items-center pt-20 px-6">
        <div className="text-center max-w-2xl mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            {t(locale, "home.titlePrefix")} <span className="text-[#009183]">{t(locale, "home.titleHighlight")}</span>
          </h2>
          <p className="text-slate-400 text-sm md:text-base font-medium">
            {t(locale, "home.intro")}
          </p>
        </div>

        {/* PRODUCT CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
          
          {/* Card 1: Express */}
          <Link href="/express" className="group relative bg-[#0f172a] rounded-3xl p-8 border border-slate-800 hover:border-[#009183]/50 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,145,131,0.2)] flex flex-col h-full overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#009183] rounded-full blur-[100px] opacity-10 group-hover:opacity-30 transition-opacity"></div>
            <div className="text-4xl mb-6">⚡</div>
            <h3 className="text-xl font-black text-white uppercase tracking-widest mb-3">{t(locale, "home.express.title")}</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-8 flex-1">
              {t(locale, "home.express.desc")}
            </p>
            <div className="text-[#009183] text-xs font-bold uppercase tracking-widest flex items-center gap-2 group-hover:gap-4 transition-all">
              {t(locale, "home.express.cta")} <span>→</span>
            </div>
          </Link>

          {/* Card 2: Staging */}
          {/* Skjult mens Virtual Staging er av (TG-NEW-136, lib/services.ts). */}
          {isPageEnabled(STAGING_PATH) && (
            <Link href={STAGING_PATH} className="group relative bg-[#0f172a] rounded-3xl p-8 border border-slate-800 hover:border-[#009183]/50 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,145,131,0.2)] flex flex-col h-full overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-[#009183] rounded-full blur-[100px] opacity-10 group-hover:opacity-30 transition-opacity"></div>
              <div className="text-4xl mb-6">🛋️</div>
              <h3 className="text-xl font-black text-white uppercase tracking-widest mb-3">Virtual Staging</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-8 flex-1">
                Transform empty spaces into beautifully furnished, inviting homes with Scandinavian or Luxury styles.
              </p>
              <div className="text-[#009183] text-xs font-bold uppercase tracking-widest flex items-center gap-2 group-hover:gap-4 transition-all">
                Start Staging <span>→</span>
              </div>
            </Link>
          )}

          {/* Card 3: Video */}
          {/* Skjult mens Video er av (dag 33, L0b, lib/services.ts). */}
          {isPageEnabled(VIDEO_PATH) && (
            <Link href={VIDEO_PATH} className="group relative bg-[#0f172a] rounded-3xl p-8 border border-purple-900/50 hover:border-purple-500/50 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(147,51,234,0.2)] flex flex-col h-full overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600 rounded-full blur-[100px] opacity-10 group-hover:opacity-30 transition-opacity"></div>
              <div className="text-4xl mb-6">🎬</div>
              <h3 className="text-xl font-black text-purple-400 uppercase tracking-widest mb-3">Cinematic Video</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-8 flex-1">
                Turn your property photos into a premium, 30-second social media reel using Veo AI and dynamic camera tracking.
              </p>
              <div className="text-purple-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2 group-hover:gap-4 transition-all">
                Build Film <span>→</span>
              </div>
            </Link>
          )}

        </div>
      </main>
    </div>
  );
}
