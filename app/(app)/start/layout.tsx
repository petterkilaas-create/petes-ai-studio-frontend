import type { Metadata } from "next";

// Fanetittel (TG-NEW-153): «Start · visningsnavn» via title.template i (app)/layout.tsx.
// Siden er "use client" og kan ikke eksportere metadata selv.
export const metadata: Metadata = { title: "Start" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
