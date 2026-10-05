import type { Metadata } from "next";
import { t } from "@/app/lib/i18n";
import { requestLocale } from "@/app/lib/i18n/requestLocale";

// Fanetittel: «Tjenester · visningsnavn» via title.template i (app)/layout.tsx, paa
// brukerens spraak (TG-NEW-129). Siden er "use client" og kan ikke eksportere
// metadata selv.
export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await requestLocale(), "title.services") };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
