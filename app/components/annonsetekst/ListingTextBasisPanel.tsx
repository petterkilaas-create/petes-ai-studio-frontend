"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { groupFacts } from "../../lib/listingTextPackage";
import { codeText, t } from "../../lib/i18n";
import { Card } from "../ui/Card";
import { Pill } from "../ui/Pill";
import { FOCUS } from "../godkjenning/classes";
import { BasisGate, FactList, IssueRow, PdfButton, type PackageCtx } from "./ListingTextFacts";

/**
 * «Se grunnlag» (TG-NEW-281, T3), lukket som standard: alle faktaene gruppert
 * etter kilde, avvikene i grunnlaget (`basis.issues`) og dokumentene, med
 * «brukt i denne versjonen» og «Åpne PDF». Grunnlaget er hentet én gang
 * (useListingTextBasis); mens det hentes, staar «Henter …».
 */
export function ListingTextBasisPanel({ ctx }: { ctx: PackageCtx }) {
  const { locale } = ctx;
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="lt-basis"
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-11 items-center justify-between gap-3 rounded-button text-left text-lg font-medium text-ink ${FOCUS}`}
      >
        {t(locale, open ? "listingText.basis.hide" : "listingText.basis.show")}
        <ChevronDown aria-hidden className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id="lt-basis" className="flex flex-col gap-6">
          <BasisGate ctx={ctx}>
            {(basis) => {
              const groups = basis === null ? [] : groupFacts(locale, basis.facts, ctx.documents);
              return (
                <>
                  <section className="flex flex-col gap-3">
                    <h3 className="text-sm font-medium text-ink-2">{t(locale, "listingText.basis.facts")}</h3>
                    {groups.length === 0 && <p className="text-sm text-ink-2">{t(locale, "listingText.basis.empty")}</p>}
                    {groups.map((group) => (
                      <div key={group.key} className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium text-ink break-words">{group.title}</h4>
                        <FactList ctx={ctx} facts={group.facts} basis={basis} scope={`basis:${group.key}`} />
                      </div>
                    ))}
                  </section>
                  {basis !== null && basis.issues.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <h3 className="text-sm font-medium text-ink-2">{t(locale, "listingText.basis.issues")}</h3>
                      <ul className="flex flex-col gap-3">
                        {basis.issues.map((issue, i) => (
                          <IssueRow key={`${issue.id}:${i}`} ctx={ctx} issue={issue} />
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              );
            }}
          </BasisGate>
          {ctx.documents.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-ink-2">{t(locale, "listingText.docs.title")}</h3>
              <ul className="flex flex-col gap-2">
                {ctx.documents.map((doc) => (
                  <li key={doc.id} className="flex flex-col gap-1 rounded-button bg-surface-2 p-3 text-sm">
                    <span className="font-medium text-ink break-words">{doc.fileName}</span>
                    <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                      <span>{codeText(locale, "listingTextDocumentKind", doc.kind)}</span>
                      {doc.pages !== null && <span>{t(locale, "listingText.basis.pages", { n: doc.pages })}</span>}
                      {doc.usedInVersion && <Pill tone="green">{t(locale, "listingText.basis.usedInVersion")}</Pill>}
                    </span>
                    {doc.status === "ready" && <PdfButton ctx={ctx} pdfKey={`doc:${doc.id}`} documentId={doc.id} page={null} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
