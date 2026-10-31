"use client";

import type { ReactNode } from "react";
import type { BasisLoad } from "../../hooks/useListingTextBasis";
import {
  LISTING_TEXT_LOCALE,
  severityKey,
  type Fact,
  type ListingTextBasis,
  type ListingTextChannels,
  type ListingTextDocument,
  type ListingTextIssue,
} from "../../lib/listingText";
import { factName, factSource, fieldRef, pdfResultText, type FieldRef, type PdfResult } from "../../lib/listingTextPackage";
import { codeText, t, type Locale } from "../../lib/i18n";
import { Button, buttonClass } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { FOCUS } from "../godkjenning/classes";

/** «Åpne PDF» for én knapp: mens lenken hentes, og resultatet etterpaa. */
export type PdfState = { key: string; state: { kind: "opening" } | PdfResult } | null;

/** Det feltene, kildene og grunnlaget trenger fra pakken (ListingTextPackage). */
export interface PackageCtx {
  locale: Locale;
  issues: readonly ListingTextIssue[];
  channels: ListingTextChannels;
  documents: readonly ListingTextDocument[];
  basis: BasisLoad;
  onRetryBasis: () => void;
  pdf: PdfState;
  onOpenPdf: (key: string, documentId: string, page: number | null) => void;
  /** Elementet som er markert etter et klikk paa et feltnavn i avvikene. */
  flash: string | null;
  onGoTo: (ref: FieldRef) => void;
}

const SMALL_BUTTON = buttonClass("secondary", "px-3");

/** «Åpne PDF» med meldingen etter klikket (404, mock, stoppet fane). */
export function PdfButton({ ctx, pdfKey, documentId, page }: { ctx: PackageCtx; pdfKey: string; documentId: string; page: number | null }) {
  const mine = ctx.pdf !== null && ctx.pdf.key === pdfKey ? ctx.pdf.state : null;
  const message = mine === null || mine.kind === "opening" ? null : pdfResultText(ctx.locale, mine);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={SMALL_BUTTON}
        disabled={mine?.kind === "opening"}
        onClick={() => ctx.onOpenPdf(pdfKey, documentId, page)}
      >
        {t(ctx.locale, mine?.kind === "opening" ? "listingText.sources.opening" : "listingText.sources.openPdf")}
      </button>
      <span role="status" className="text-[13px] text-amber-fg">
        {message ?? ""}
      </span>
    </span>
  );
}

/** Faktaene med navn, verdi og kilde; `material` merket. Brukt under feltene og i «Se grunnlag». */
export function FactList({ ctx, facts, basis, scope }: { ctx: PackageCtx; facts: readonly Fact[]; basis: ListingTextBasis | null; scope: string }) {
  const { locale } = ctx;
  return (
    <ul className="flex flex-col gap-2">
      {facts.map((fact) => {
        const source = factSource(locale, fact, ctx.documents, basis);
        return (
          <li key={fact.id} className="flex flex-col gap-1 rounded-button bg-surface-2 p-3 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <span lang={LISTING_TEXT_LOCALE} className="font-medium text-ink break-words">
                {factName(fact)}
              </span>
              {fact.material && <Pill tone="amber">{t(locale, "listingText.sources.material")}</Pill>}
            </span>
            <span lang={LISTING_TEXT_LOCALE} className="text-ink break-words">
              {fact.valueText}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <span>{source.text}</span>
              {source.pdf !== null && (
                <PdfButton
                  ctx={ctx}
                  pdfKey={`${scope}:${fact.id}`}
                  documentId={source.pdf.documentId}
                  page={source.pdf.page}
                />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** «Henter …», feilen med «Prøv igjen», eller innholdet naar grunnlaget er hentet. */
export function BasisGate({ ctx, children }: { ctx: PackageCtx; children: (basis: ListingTextBasis | null) => ReactNode }) {
  const { locale, basis } = ctx;
  if (basis.kind === "idle" || basis.kind === "loading") {
    return (
      <p role="status" className="text-sm text-ink-2">
        {t(locale, "listingText.page.loading")}
      </p>
    );
  }
  if (basis.kind === "error") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-fg">
          {`${t(locale, "listingText.basis.error")} ${codeText(locale, "listingTextError", basis.code)}`}
        </p>
        <Button variant="secondary" onClick={ctx.onRetryBasis}>
          {t(locale, "review.retry")}
        </Button>
      </div>
    );
  }
  return <>{children(basis.basis)}</>;
}

/**
 * Ett avvik: alvoret, `message` og `suggestion` slik backend sender dem, og
 * feltene med norske navn. Et klikk paa feltnavnet ruller til feltet.
 * Ukjente koder vises likt; ingen tekst per kode (K §9.2 punkt 1).
 */
export function IssueRow({ ctx, issue }: { ctx: PackageCtx; issue: ListingTextIssue }) {
  const { locale } = ctx;
  const refs = issue.fields.map((path) => ({ path, ref: fieldRef(locale, path, ctx.channels) }));
  return (
    <li
      className={`flex flex-col gap-2 rounded-button border-l-4 bg-surface-2 p-3 ${
        issue.severity === "material" ? "border-amber-fg" : "border-line-strong"
      }`}
    >
      <span>
        <Pill tone={issue.severity === "material" ? "amber" : "neutral"}>{t(locale, severityKey(issue.severity))}</Pill>
      </span>
      <p lang={LISTING_TEXT_LOCALE} className="text-sm text-ink break-words whitespace-pre-line">
        {issue.message}
      </p>
      {issue.suggestion !== null && (
        <p className="text-sm text-ink-2 break-words">
          <span className="font-medium">{t(locale, "listingText.issues.suggestion")}</span>{" "}
          <span lang={LISTING_TEXT_LOCALE} className="whitespace-pre-line">
            {issue.suggestion}
          </span>
        </p>
      )}
      {refs.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <span>{t(locale, "listingText.issues.fields")}</span>
          {refs.map(({ path, ref }) =>
            ref.anchor !== null ? (
              <button
                key={path}
                type="button"
                onClick={() => ctx.onGoTo(ref)}
                className={`min-h-11 rounded-button px-2 text-ink underline underline-offset-2 hover:text-ink-2 ${FOCUS}`}
              >
                {ref.text}
              </button>
            ) : (
              <span key={path} className="px-2">
                {ref.text}
              </span>
            )
          )}
        </p>
      )}
    </li>
  );
}
