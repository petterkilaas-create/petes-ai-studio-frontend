"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { copyText, type CopyResult } from "../../lib/clipboard";
import {
  copyTextFor,
  LENGTH_TARGETS,
  LISTING_TEXT_LOCALE,
  measureChannels,
  splitWorthKnowing,
  type Channel,
  type LengthPath,
  type TextItem,
} from "../../lib/listingText";
import {
  checkKey,
  factsFor,
  fieldAnchorId,
  fieldFactIds,
  fieldName,
  issuesForField,
  lengthText,
  outsideTarget,
  worthKnowing,
} from "../../lib/listingTextPackage";
import { t } from "../../lib/i18n";
import { buttonClass } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { BasisGate, FactList, type PackageCtx } from "./ListingTextFacts";

const COPY_BUTTON = buttonClass("secondary", "min-w-24");
const FLASH = "ring-2 ring-accent ring-offset-2 ring-offset-paper";

function isLengthPath(path: string): path is LengthPath {
  return Object.hasOwn(LENGTH_TARGETS, path);
}

/** Merknaden «Delvis støttet …» eller «Ikke støttet …» for et avsnitt eller hoeydepunkt. */
function CheckNote({ ctx, item }: { ctx: PackageCtx; item: TextItem }) {
  const key = checkKey(item.check);
  if (key === null) return null;
  return <span className="mt-1 block text-[13px] text-amber-fg">{t(ctx.locale, key)}</span>;
}

/** Avsnittene i hovedteksten; «Verdt å vite:» uthevet i starten av siste avsnitt. */
function Paragraphs({ ctx, items }: { ctx: PackageCtx; items: readonly TextItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const path = `finn.body.${item.id}`;
        const anchor = fieldAnchorId(path);
        const flagged = issuesForField(ctx.issues, path).length !== 0;
        const worth = i === items.length - 1 ? splitWorthKnowing(item.text) : null;
        return (
          <p
            key={item.id}
            id={anchor}
            tabIndex={-1}
            className={`rounded-button outline-none ${flagged ? "border-l-4 border-amber-fg pl-3" : ""} ${
              ctx.flash === anchor ? FLASH : ""
            }`}
          >
            {worth !== null ? (
              <>
                <strong className="font-semibold">{worth.lead}</strong>
                {worth.rest}
              </>
            ) : (
              item.text
            )}
            <CheckNote ctx={ctx} item={item} />
          </p>
        );
      })}
    </div>
  );
}

/** Hoeydepunktene som punktliste. */
function Highlights({ ctx, items }: { ctx: PackageCtx; items: readonly TextItem[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {items.map((item) => {
        const path = `finn.highlights.${item.id}`;
        const anchor = fieldAnchorId(path);
        const flagged = issuesForField(ctx.issues, path).length !== 0;
        return (
          <li
            key={item.id}
            id={anchor}
            tabIndex={-1}
            className={`rounded-button outline-none ${flagged ? "marker:text-amber-fg font-medium" : ""} ${
              ctx.flash === anchor ? FLASH : ""
            }`}
          >
            {item.text}
            <CheckNote ctx={ctx} item={item} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ett felt: navnet, teksten (ren tekst, linjeskift bevart), antallet og
 * maalet, markering ved avvik, «Kopier» (`copy_text` fra backend) og
 * «Vis kilder». Feiler utklippstavlen, markeres teksten saa megleren kan
 * kopiere selv.
 */
function Field({
  ctx,
  path,
  measured,
  extra,
  children,
}: {
  ctx: PackageCtx;
  path: string;
  measured: number | undefined;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const { locale } = ctx;
  const anchor = fieldAnchorId(path);
  const textRef = useRef<HTMLDivElement>(null);
  const [copy, setCopy] = useState<CopyResult | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  const copyValue = copyTextFor(ctx.channels, path);
  const factIds = fieldFactIds(ctx.channels, path);
  const flagged = issuesForField(ctx.issues, path).length !== 0;
  const outside = outsideTarget(ctx.issues, path);

  const onCopy = async (value: string) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    const outcome = await copyText(value);
    setCopy(outcome);
    if (outcome === "copied") {
      resetTimer.current = setTimeout(() => setCopy(null), 2000);
    } else if (textRef.current !== null) {
      // Reserve: marker teksten, saa megleren kan trykke Cmd+C.
      window.getSelection()?.selectAllChildren(textRef.current);
    }
  };

  return (
    <section
      id={anchor}
      tabIndex={-1}
      aria-label={fieldName(locale, path)}
      className={`flex flex-col gap-3 rounded-card border bg-surface p-4 outline-none md:p-5 ${
        flagged ? "border-amber-fg" : "border-line"
      } ${ctx.flash === anchor ? FLASH : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-ink-2">{fieldName(locale, path)}</h3>
        <span className="flex flex-wrap gap-2">
          {flagged && <Pill tone="amber">{t(locale, "listingText.field.hasIssue")}</Pill>}
          {outside && <Pill tone="amber">{t(locale, "listingText.length.outside")}</Pill>}
        </span>
      </div>
      <div ref={textRef} lang={LISTING_TEXT_LOCALE} className="text-ink break-words whitespace-pre-line select-text">
        {children}
      </div>
      {(measured !== undefined || extra) && (
        <p className="flex flex-col gap-1 text-[13px] text-ink-2">
          {measured !== undefined && isLengthPath(path) && <span>{lengthText(locale, path, measured)}</span>}
          {extra}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {copyValue !== null && (
          <button type="button" className={COPY_BUTTON} onClick={() => void onCopy(copyValue)}>
            {t(locale, copy === "copied" ? "review.copied" : "action.copy")}
          </button>
        )}
        {factIds.length > 0 && (
          <button
            type="button"
            className={buttonClass("secondary")}
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((open) => !open)}
          >
            {t(locale, sourcesOpen ? "listingText.sources.hide" : "listingText.sources.show")}
          </button>
        )}
        <span role="status" className="text-[13px] text-amber-fg">
          {copy === "failed" ? t(locale, "review.copyFailed") : ""}
        </span>
      </div>
      {sourcesOpen && (
        <BasisGate ctx={ctx}>
          {(basis) => {
            const facts = factsFor(basis, factIds);
            return facts.length === 0 ? (
              <p className="text-sm text-ink-2">{t(locale, "listingText.sources.none")}</p>
            ) : (
              <FactList ctx={ctx} facts={facts} basis={basis} scope={path} />
            );
          }}
        </BasisGate>
      )}
    </section>
  );
}

/**
 * Feltene i én kanal (TG-NEW-281, T3): FINN (overskrift, ingress,
 * hovedteksten avsnitt for avsnitt, hoeydepunktene og naermiljoeet),
 * SoMe (innlegget, faktalinja og emneknaggene) og E-post (emne,
 * forhaandstekst, teksten og signaturen).
 */
export function ListingTextChannel({ ctx, channel }: { ctx: PackageCtx; channel: Channel }) {
  const { locale, channels } = ctx;
  const m = measureChannels(channels);

  if (channel === "finn" && channels.finn !== null) {
    const finn = channels.finn;
    const worth = worthKnowing(finn.body);
    return (
      <div className="flex flex-col gap-4">
        <Field ctx={ctx} path="finn.headline" measured={m["finn.headline"]}>
          {finn.headline.text}
        </Field>
        <Field ctx={ctx} path="finn.intro" measured={m["finn.intro"]}>
          {finn.intro.text}
        </Field>
        <Field
          ctx={ctx}
          path="finn.body"
          measured={m["finn.body"]}
          extra={worth !== null && <span>{t(locale, "listingText.length.worthKnowing", { n: worth.words })}</span>}
        >
          <Paragraphs ctx={ctx} items={finn.body} />
        </Field>
        <Field ctx={ctx} path="finn.highlights" measured={m["finn.highlights"]}>
          <Highlights ctx={ctx} items={finn.highlights} />
        </Field>
        {finn.neighbourhood !== null && (
          <Field ctx={ctx} path="finn.neighbourhood" measured={m["finn.neighbourhood"]}>
            {finn.neighbourhood.text}
          </Field>
        )}
      </div>
    );
  }

  if (channel === "social" && channels.social !== null) {
    const social = channels.social;
    return (
      <div className="flex flex-col gap-4">
        <Field ctx={ctx} path="social.post" measured={m["social.post"]}>
          {social.post.text}
        </Field>
        <Field ctx={ctx} path="social.fact_line" measured={undefined}>
          {social.factLine.text}
        </Field>
        <Field ctx={ctx} path="social.hashtags" measured={m["social.hashtags"]}>
          {social.hashtags.join(" ")}
        </Field>
      </div>
    );
  }

  if (channel === "email" && channels.email !== null) {
    const email = channels.email;
    return (
      <div className="flex flex-col gap-4">
        <Field ctx={ctx} path="email.subject" measured={m["email.subject"]}>
          {email.subject.text}
        </Field>
        <Field ctx={ctx} path="email.preheader" measured={m["email.preheader"]}>
          {email.preheader.text}
        </Field>
        <Field ctx={ctx} path="email.body" measured={m["email.body"]}>
          {email.body.text}
        </Field>
        {email.signature !== "" && (
          <Field ctx={ctx} path="email.signature" measured={undefined}>
            {email.signature}
          </Field>
        )}
      </div>
    );
  }

  return null;
}
