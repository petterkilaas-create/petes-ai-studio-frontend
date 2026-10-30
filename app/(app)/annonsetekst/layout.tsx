import type { Metadata } from "next";
import { t } from "@/app/lib/i18n";
import { requestLocale } from "@/app/lib/i18n/requestLocale";

// Fanetittel: «Annonsetekst · visningsnavn» via title.template i (app)/layout.tsx, som
// ordrene. Gjelder ogsaa tekstsiden per ordre. Sidene er "use client" og kan ikke
// eksportere metadata selv.
export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await requestLocale(), "title.listingText") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
