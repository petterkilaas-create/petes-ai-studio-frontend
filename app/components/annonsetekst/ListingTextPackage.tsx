"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import type { AssignmentRequest } from "../../lib/assignments";
import { useListingTextBasis } from "../../hooks/useListingTextBasis";
import {
  KEY_NAMES,
  keyStatusKey,
  listingTextStatusKey,
  sortIssues,
  LISTING_TEXT_LOCALE,
  type Channel,
  type KeyFact,
  type ListingText,
  type ListingTextChannels,
} from "../../lib/listingText";
import {
  channelName,
  issueCountText,
  lastRunFailedText,
  openListingTextDocument,
  presentChannels,
  statusTone,
  versionTime,
  type FieldRef,
  type PdfTab,
} from "../../lib/listingTextPackage";
import { codeText, t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";
import { Card } from "../ui/Card";
import { Pill } from "../ui/Pill";
import { FOCUS } from "../godkjenning/classes";
import { ListingTextBasisPanel } from "./ListingTextBasisPanel";
import { ListingTextChannel } from "./ListingTextChannel";
import { IssueRow, type PackageCtx, type PdfState } from "./ListingTextFacts";

/** Hvor lenge feltet er markert etter et klikk paa feltnavnet i et avvik. */
const FLASH_MS = 2000;
const NO_VALUE = "—";

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const KEY_TONES = { found: "green", missing: "red", conflict: "amber" } as const;

/** Nøkkelopplysningene i fast rekkefoelge; `missing` og `conflict` tydelig merket. */
function KeyFacts({ keyFacts, locale }: { keyFacts: readonly KeyFact[]; locale: PackageCtx["locale"] }) {
  const rows = KEY_NAMES.map((key) => keyFacts.find((k) => k.key === key)).filter((k): k is KeyFact => k !== undefined);
  if (rows.length === 0) return null;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-ink">{t(locale, "listingText.keyFacts.title")}</h2>
        <p className="text-sm text-ink-2">{t(locale, "listingText.keyFacts.hint")}</p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((k) => (
          <li
            key={k.key}
            className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 ${
              k.status === "found" ? "" : "border-l-4 pl-3 " + (k.status === "missing" ? "border-red-fg" : "border-amber-fg")
            }`}
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-ink">{codeText(locale, "listingTextKeyFact", k.key)}</span>
              <span lang={LISTING_TEXT_LOCALE} className="text-sm text-ink break-words">
                {k.valueText ?? NO_VALUE}
              </span>
            </span>
            <Pill tone={KEY_TONES[k.status]}>{t(locale, keyStatusKey(k.status))}</Pill>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Tekstpakken (TG-NEW-281, T3) for `to_review`, `approved` og `failed` med
 * versjon: toppen med status og versjon, avvikene oeverst, nøkkelopplysningene,
 * kanalene som faner (FINN, SoMe, E-post; bare de som finnes) og «Se
 * grunnlag». Ingen redigering, godkjenning eller eksport (T4).
 *
 * Grunnlaget hentes én gang per versjon (useListingTextBasis). «Åpne PDF»
 * aapner fanen i klikket og setter adressen naar lenken kommer; lenken lagres
 * aldri i tilstanden.
 */
export function ListingTextPackage({
  pkg,
  channels,
  assignmentId,
  request,
  openTab,
}: {
  pkg: ListingText;
  channels: ListingTextChannels;
  assignmentId: string;
  request: AssignmentRequest;
  openTab: () => PdfTab | null;
}) {
  const locale = useLocale();
  const basis = useListingTextBasis(assignmentId, request, pkg.version);
  const present = presentChannels(channels);
  const [tab, setTab] = useState<Channel | null>(null);
  const active = tab !== null && present.includes(tab) ? tab : (present[0] ?? null);
  const [focus, setFocus] = useState<{ anchor: string; n: number } | null>(null);
  const [pdf, setPdf] = useState<PdfState>(null);

  // Etter et klikk paa et feltnavn: rull til feltet (fanen er byttet), flytt fokus og marker kort.
  useEffect(() => {
    if (focus === null) return;
    const el = document.getElementById(focus.anchor);
    if (el !== null) {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      el.focus({ preventScroll: true });
    }
    const timer = setTimeout(() => setFocus(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [focus]);

  const issues = sortIssues(pkg.issues);

  const ctx: PackageCtx = {
    locale,
    issues,
    channels,
    documents: pkg.documents,
    basis: basis.load,
    onRetryBasis: basis.retry,
    pdf,
    onOpenPdf: (key, documentId, page) => {
      setPdf({ key, state: { kind: "opening" } });
      // Fanen aapnes i klikket (foerst i kallet); svaret setter bare resultatet, aldri lenken.
      void openListingTextDocument({ request, id: assignmentId, documentId, page, openTab }).then((result) =>
        setPdf({ key, state: result })
      );
    },
    flash: focus?.anchor ?? null,
    onGoTo: (ref: FieldRef) => {
      if (ref.channel === null || ref.anchor === null) return;
      const anchor = ref.anchor;
      setTab(ref.channel);
      setFocus((prev) => ({ anchor, n: (prev?.n ?? 0) + 1 }));
    },
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (active === null || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    const i = present.indexOf(active);
    const next = present[(i + (e.key === "ArrowRight" ? 1 : present.length - 1)) % present.length];
    setTab(next);
    document.getElementById(`lt-tab-${next}`)?.focus();
  };

  const failedText = lastRunFailedText(locale, pkg);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-medium text-ink">{t(locale, "listingText.ready.title")}</h2>
          <Pill tone={statusTone(pkg.displayStatus)}>{t(locale, listingTextStatusKey(pkg.displayStatus))}</Pill>
        </div>
        {pkg.version !== null && (
          <p className="text-sm text-ink-2">
            {`${t(locale, "listingText.package.version", { n: pkg.version })} · ${versionTime(locale, pkg)}`}
          </p>
        )}
        {failedText !== null && (
          <p role="status" className="rounded-button bg-red-bg p-3 text-sm text-red-fg">
            {failedText}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium text-ink">{t(locale, "listingText.issues.title")}</h2>
          <p className="text-sm text-ink-2">{issueCountText(locale, issues)}</p>
        </div>
        {issues.length > 0 && (
          <ul className="flex flex-col gap-3">
            {issues.map((issue, i) => (
              <IssueRow key={`${issue.id}:${i}`} ctx={ctx} issue={issue} />
            ))}
          </ul>
        )}
      </Card>

      <KeyFacts keyFacts={pkg.keyFacts} locale={locale} />

      {active !== null && (
        <section className="flex min-w-0 flex-col gap-4">
          <div
            role="tablist"
            aria-label={t(locale, "listingText.channels.label")}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
          >
            {present.map((c) => (
              <button
                key={c}
                id={`lt-tab-${c}`}
                type="button"
                role="tab"
                aria-selected={c === active}
                aria-controls={`lt-panel-${c}`}
                tabIndex={c === active ? 0 : -1}
                onClick={() => setTab(c)}
                onKeyDown={onTabKey}
                className={`min-h-11 shrink-0 rounded-button border px-4 py-2 text-sm transition-colors ${FOCUS} ${
                  c === active
                    ? "border-primary bg-primary font-medium text-on-primary"
                    : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {channelName(locale, c)}
              </button>
            ))}
          </div>
          <div id={`lt-panel-${active}`} role="tabpanel" aria-labelledby={`lt-tab-${active}`}>
            <ListingTextChannel ctx={ctx} channel={active} />
          </div>
        </section>
      )}

      <ListingTextBasisPanel ctx={ctx} />
    </div>
  );
}
