"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import type { Link } from "../../../content/marketing/schema";
import { FOCUS } from "./classes";

/**
 * Menyen under 820 px (MS3): knappen «Meny» med aria-expanded og
 * aria-controls. Escape lukker og setter fokus tilbake paa knappen, og
 * menyen lukkes naar en lenke velges. Over 820 px vises lenkene i
 * topplinjen i stedet. Lenkene er de samme (bare ankre som finnes).
 */
export function MobileMenu({ label, navLabel, links }: { label: string; navLabel: string; links: Link[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (links.length === 0) return null;

  return (
    <div className="min-[820px]:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 items-center gap-2 rounded-button px-3 text-[15px] font-medium text-ink hover:bg-surface-2 ${FOCUS}`}
      >
        {open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
        {label}
      </button>
      <nav
        id={panelId}
        aria-label={navLabel}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-paper px-4 py-3 shadow-sm"
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center rounded-button px-3 text-[16px] font-medium text-ink no-underline hover:bg-surface-2 ${FOCUS}`}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
