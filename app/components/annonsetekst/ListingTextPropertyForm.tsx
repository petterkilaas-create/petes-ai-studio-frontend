"use client";

import { useId, useState } from "react";
import {
  KEY_FACT_COUNT,
  KEY_FIELDS,
  keyFactsFilled,
  locationFromOrder,
  PROPERTY_GROUPS,
  PROPERTY_SPECS,
  propertyErrors,
  tidyPropertyField,
  type PropertyDraft,
  type PropertyKey,
} from "../../lib/listingTextProperty";
import { FOCUS } from "../godkjenning/classes";
import { codeText, t, type UiKey } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Boligfakta i bestillingen (TG-NEW-281, K §10.1): feltene i en rekkefoelge
 * som ligner FINN, med de seks noekkelopplysningene merket og telleren over.
 * To kolonner paa PC, under hverandre paa mobil. Feilen vises ved feltet
 * naar feltet er forlatt; tallene faar norsk format da. Tilstanden eies av
 * ListingTextOrder.
 */

const INPUT = `block w-full min-h-11 rounded-button border border-ink-2 bg-surface px-3 py-2 text-sm text-ink ${FOCUS}`;

const fieldKey = (key: PropertyKey) => `listingText.property.field.${key}` as UiKey;
const errorKey = (code: string) => `listingText.property.error.${code}` as UiKey;

/** Tastaturet paa mobil: etasjen kan vaere under null, arealene har desimaler. */
function inputMode(key: PropertyKey): "numeric" | "decimal" | "text" {
  const spec = PROPERTY_SPECS[key];
  if (spec.kind !== "number" || key === "floor") return "text";
  return spec.decimals > 0 ? "decimal" : "numeric";
}

export function ListingTextPropertyForm({
  draft,
  orderAddress,
  onField,
}: {
  draft: PropertyDraft;
  orderAddress: string;
  onField: (key: PropertyKey, value: string) => void;
}) {
  const locale = useLocale();
  const baseId = useId();
  // Et utkast med feil fra foer viser feilene med en gang (ellers er knappen graa uten merket felt).
  const [left, setLeft] = useState<ReadonlySet<PropertyKey>>(() => new Set(Object.keys(propertyErrors(draft)) as PropertyKey[]));
  const errors = propertyErrors(draft);
  const filled = keyFactsFilled(draft, orderAddress);

  function leave(key: PropertyKey) {
    const tidy = tidyPropertyField(key, draft[key]);
    if (tidy !== draft[key]) onField(key, tidy);
    setLeft((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  function field(key: PropertyKey) {
    const spec = PROPERTY_SPECS[key];
    const id = `${baseId}-${key}`;
    const error = left.has(key) ? errors[key] : undefined;
    const errorId = `${id}-error`;
    const control = {
      id,
      value: draft[key],
      onBlur: () => leave(key),
      "aria-invalid": error !== undefined,
      "aria-describedby": error !== undefined ? errorId : undefined,
      className: INPUT,
    };
    return (
      <div key={key} className={`flex flex-col gap-1 ${key === "address" ? "sm:col-span-2" : ""}`}>
        <label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-ink">
          {t(locale, fieldKey(key))}
          {KEY_FIELDS.has(key) && <span className="text-xs font-normal text-ink-2">{t(locale, "listingText.property.keyMark")}</span>}
        </label>
        {spec.kind === "choice" ? (
          <select {...control} onChange={(e) => onField(key, e.target.value)}>
            <option value="">{t(locale, "listingText.property.choose")}</option>
            {spec.options.map((code) => (
              <option key={code} value={code}>
                {key === "energy_letter" ? code : codeText(locale, "listingTextPropertyOption", `${key}.${code}`)}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...control}
            type="text"
            inputMode={inputMode(key)}
            autoComplete={key === "address" ? "street-address" : "off"}
            maxLength={spec.kind === "text" ? spec.max : undefined}
            onChange={(e) => onField(key, e.target.value)}
          />
        )}
        {error !== undefined && (
          <p id={errorId} className="text-sm text-red-fg">
            {t(locale, errorKey(error.code), error.vars)}
          </p>
        )}
      </div>
    );
  }

  const targetHintId = `${baseId}-target-hint`;
  const targetError = left.has("target_group") ? errors.target_group : undefined;

  return (
    <section aria-labelledby={`${baseId}-title`} className="flex flex-col gap-4">
      <div>
        <h2 id={`${baseId}-title`} className="text-lg font-medium text-ink">
          {t(locale, "listingText.property.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-2">{t(locale, "listingText.property.hint")}</p>
        <p className="mt-2 flex flex-wrap gap-x-2 text-sm" aria-live="polite">
          <span className="font-medium text-ink">{t(locale, "listingText.property.keyCount", { n: filled, max: KEY_FACT_COUNT })}</span>
          {locationFromOrder(draft, orderAddress) && (
            <span className="text-ink-2">{t(locale, "listingText.property.locationFromOrder")}</span>
          )}
        </p>
      </div>
      {PROPERTY_GROUPS.map((group) => (
        <div key={group[0]} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {group.map(field)}
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${baseId}-target_group`} className="text-sm font-medium text-ink">
          {t(locale, fieldKey("target_group"))}
        </label>
        <p id={targetHintId} className="text-sm text-ink-2">
          {t(locale, "listingText.property.targetHint")}
        </p>
        <input
          id={`${baseId}-target_group`}
          type="text"
          value={draft.target_group}
          maxLength={PROPERTY_SPECS.target_group.kind === "text" ? PROPERTY_SPECS.target_group.max : undefined}
          onChange={(e) => onField("target_group", e.target.value)}
          onBlur={() => leave("target_group")}
          aria-invalid={targetError !== undefined}
          aria-describedby={targetError !== undefined ? `${targetHintId} ${baseId}-target-error` : targetHintId}
          className={INPUT}
        />
        {targetError !== undefined && (
          <p id={`${baseId}-target-error`} className="text-sm text-red-fg">
            {t(locale, errorKey(targetError.code), targetError.vars)}
          </p>
        )}
      </div>
    </section>
  );
}
