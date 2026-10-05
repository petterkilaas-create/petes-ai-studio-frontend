"use client";

import Link from "next/link";
import { ArrowRight, Clapperboard, LayoutGrid, Sofa, type LucideIcon } from "lucide-react";
import { isPageEnabled, SERVICES_PATH, STAGING_PATH, VIDEO_PATH } from "@/app/lib/services";
import { DEFAULT_BRAND } from "@/app/lib/brand";
import { cardClass } from "@/app/components/ui/Card";
import { t } from "@/app/lib/i18n";
import { useLocale } from "@/app/lib/i18n/useLocale";

// Merket per foretak kommer med TG-NEW-128 (via resolveBrand).
const brand = DEFAULT_BRAND;

function ProductCard({
  href,
  icon: Icon,
  title,
  desc,
  cta,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className={cardClass(
        "lg",
        "group flex h-full flex-col transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      )}
    >
      <span aria-hidden className="mb-6 flex size-11 items-center justify-center rounded-button bg-surface-2 text-ink">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <h2 className="mb-2 text-lg font-medium text-ink">{title}</h2>
      <p className="mb-8 flex-1 text-sm leading-relaxed text-ink-2">{desc}</p>
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        {cta}
        <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
      </span>
    </Link>
  );
}

export default function Home() {
  const locale = useLocale();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 md:px-8 md:py-20">
      <div className="mb-12 max-w-2xl">
        <h1 className="font-display text-[40px] leading-[1.05] text-ink md:text-[56px]">
          {t(locale, "home.title", { brand: brand.displayName })}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-2">{t(locale, "home.intro")}</p>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
        <ProductCard
          href={SERVICES_PATH}
          icon={LayoutGrid}
          title={t(locale, "home.services.title")}
          desc={t(locale, "home.services.desc")}
          cta={t(locale, "home.services.cta")}
        />

        {/* Skjult mens Virtual Staging er av (TG-NEW-136, lib/services.ts). */}
        {isPageEnabled(STAGING_PATH) && (
          <ProductCard
            href={STAGING_PATH}
            icon={Sofa}
            title="Virtual Staging"
            desc="Transform empty spaces into beautifully furnished, inviting homes with Scandinavian or Luxury styles."
            cta="Start Staging"
          />
        )}

        {/* Skjult mens Video er av (dag 33, L0b, lib/services.ts). */}
        {isPageEnabled(VIDEO_PATH) && (
          <ProductCard
            href={VIDEO_PATH}
            icon={Clapperboard}
            title="Cinematic Video"
            desc="Turn your property photos into a premium, 30-second social media reel using Veo AI and dynamic camera tracking."
            cta="Build Film"
          />
        )}
      </div>
    </main>
  );
}
