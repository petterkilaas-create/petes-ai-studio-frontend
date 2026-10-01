import type { Metadata } from "next";

// Fanetittel (D1): «Historikk · visningsnavn» via title.template i app/layout.tsx.
// Siden er "use client" og kan ikke eksportere metadata selv.
export const metadata: Metadata = { title: "Historikk" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
