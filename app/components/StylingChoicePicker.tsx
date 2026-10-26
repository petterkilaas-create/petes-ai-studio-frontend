"use client";

import { useId, useRef, useState } from "react";
import type { StaticImageData } from "next/image";
import {
  addSuggestion,
  clampWishes,
  DECOR_LEVELS,
  FURNISH_AS_CHOICES,
  isWishRoom,
  MAX_ORDER_JOBS,
  STYLING_STYLES,
  styleShort,
  toggleStyle,
  wishesLength,
  wishSuggestions,
  WISHES_MAX,
  type DecorLevel,
  type StylingChoice,
  type StylingStyle,
} from "../lib/styling";
import { MOODBOARDS, ROOM_ICONS } from "../lib/moodboards";
import { codeText, t, type Locale } from "../lib/i18n";
import { StyleCards } from "./styling/StyleCards";
import { StyleFocusPanel } from "./styling/StyleFocusPanel";
import { MoodboardDialog } from "./styling/Moodboard";
import { DecorDots } from "./styling/DecorDots";
import { SvgArt } from "./styling/SvgArt";

const OPTION =
  "min-h-11 px-4 py-2 rounded-pill text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
// Valgt = primary, saa valget ikke bare vises med farge (aria-pressed i tillegg).
const ON = "bg-primary border-primary text-on-primary font-medium";
const OFF = "bg-surface border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink";
const LABEL = "text-sm font-medium text-ink";
// Romflisene (D-3 kompakt, «1 · Rommet» i Styling.dc.html): ikon, etikett og linje.
// PC: fem per rad (to rader). Mobil: én rad som sveipes, som i MobilStil.dc.html.
const ROOM_TILE =
  "flex min-h-14 items-center gap-2.5 rounded-button border px-2.5 py-2 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
const ROOM_ON = "border-ink bg-surface ring-1 ring-ink text-ink";
const ROOM_OFF = "border-line bg-surface text-ink hover:border-line-strong";

/** Prikkene i pyntknappene: ●○○ Lite, ●●○ Middels, ●●● Mye. */
const DECOR_DOTS: Record<DecorLevel, number> = { 1: 1, 3: 2, 5: 3 };

/**
 * Valgene for Digital styling (S2-f), kompakt (D-3 kompakt, Petter 15.53):
 * 1 · romtypen («Møbler som …», ni fliser med ikon) med bekreftelsen av at
 * rommet er tomt (Petter 3A) i samme rad, 2 · stilene (flervalg av 14,
 * hoeyst tre, S3-f, F1 og stilene v3) som smaa fargekort og
 * utstillingsvinduet for stilen i fokus, og 3 · mengden pynt («Anbefalt for
 * stilen» fra start, TG-NEW-257). Uten stil, romtype og kryss er «Bestill»
 * av (stylingParams gir null); den faste bestillingslinja staar paa siden.
 * 4 · ønskene (TG-NEW-250) vises bare for stuene (isWishRoom); for andre rom
 * staar én linje. Feltet klemmes til 300 kodepunkter, og et forslag er av
 * naar det ikke er plass. Ønsket logges aldri.
 *
 * Fokus og valg er to ting: et trykk paa et kort viser stilen i panelet,
 * haken eller knappen i panelet velger den (og viser den). Fra start vises
 * den foerste valgte, ellers 01. i-knappen paa kortet og «Åpne moodboard»
 * aapner hele moodboardet i en dialog; fokus gaar tilbake til knappen.
 *
 * Med tre valgt er resten aria-disabled (F1): de blir i Tab-rekkefoelgen og
 * leses som utilgjengelige, og gruppen peker paa hjelpelinja («opptil tre»).
 * En valgt stil kan alltid velges bort.
 *
 * Bildene kommer fra siden (styleImages.ts), fordi node --test ikke kan laste
 * .jpg og lib-filene derfor ikke importerer dem.
 */
export function StylingChoicePicker({
  value,
  onChange,
  disabled,
  images,
  locale,
}: {
  value: StylingChoice;
  onChange: (value: StylingChoice) => void;
  disabled: boolean;
  images: Record<StylingStyle, StaticImageData>;
  locale: Locale;
}) {
  const helpId = useId();
  const decorHelpId = useId();
  const wishesId = useId();
  const wishesHelpId = useId();
  const wishesCountId = useId();
  const [focus, setFocus] = useState<StylingStyle>(value.styles[0] ?? STYLING_STYLES[0]);
  const [sheet, setSheet] = useState<StylingStyle | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const atLimit = value.styles.length >= MAX_ORDER_JOBS;
  const toggle = (style: StylingStyle) => {
    setFocus(style);
    const on = value.styles.includes(style);
    const locked = atLimit && !on;
    if (!locked) onChange({ ...value, styles: toggleStyle(value.styles, style) });
  };
  const openSheet = (style: StylingStyle, from: HTMLElement) => {
    opener.current = from;
    setSheet(style);
  };
  const closeSheet = () => {
    setSheet(null);
    opener.current?.focus();
  };
  const focusOn = value.styles.includes(focus);
  const wishRoom = isWishRoom(value.furnishAs);
  const nameOf = (style: StylingStyle) => t(locale, `styling.style.${styleShort(style)}`);
  return (
    <div className="border-t border-line pt-6 space-y-5">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-6">
          <p className={LABEL}>
            <span className="text-ink-2">1 · </span>
            {t(locale, "styling.furnishAs")}
          </p>
          <label className={`flex min-h-11 items-center gap-3 text-sm select-none ${disabled ? "text-ink-2 cursor-not-allowed" : "text-ink cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={value.roomEmpty}
              onChange={(e) => onChange({ ...value, roomEmpty: e.target.checked })}
              disabled={disabled}
              className="size-5 accent-primary disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            <span>{t(locale, "styling.roomEmpty")}</span>
          </label>
        </div>
        <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pt-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:p-0 lg:grid-cols-5" role="group" aria-label={t(locale, "styling.furnishAs")}>
          {FURNISH_AS_CHOICES.map((room) => (
            <button
              key={room}
              type="button"
              onClick={() => onChange({ ...value, furnishAs: room })}
              disabled={disabled}
              aria-pressed={value.furnishAs === room}
              className={`${ROOM_TILE} w-[46%] shrink-0 snap-start sm:w-auto ${value.furnishAs === room ? ROOM_ON : ROOM_OFF}`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-button bg-paper">
                <SvgArt node={ROOM_ICONS[room]} prefix="rom" className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium leading-tight">{codeText(locale, "furnishAs", room)}</span>
                <span className="text-xs leading-tight text-ink-2">{t(locale, `styling.roomSub.${room}`)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className={LABEL}>
            <span className="text-ink-2">2 · </span>
            {t(locale, "styling.styles")}
          </p>
          <p id={helpId} className="text-sm text-ink-2">{t(locale, "styling.stylesHelp")}</p>
        </div>
        <div
          className="space-y-3"
          role="group"
          aria-label={t(locale, "styling.styles")}
          aria-describedby={helpId}
        >
          <StyleCards
            styles={value.styles}
            focus={focus}
            atLimit={atLimit}
            disabled={disabled}
            onFocus={setFocus}
            onToggle={toggle}
            onOpen={openSheet}
            locale={locale}
          />
          <StyleFocusPanel
            board={MOODBOARDS[focus]}
            name={nameOf(focus)}
            image={images[focus]}
            on={focusOn}
            locked={atLimit && !focusOn}
            disabled={disabled}
            onToggle={() => toggle(focus)}
            onOpen={(from) => openSheet(focus, from)}
            locale={locale}
          />
        </div>
        {sheet !== null && (
          <MoodboardDialog board={MOODBOARDS[sheet]} name={nameOf(sheet)} onClose={closeSheet} locale={locale} />
        )}
      </div>

      <div>
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className={LABEL}>
            <span className="text-ink-2">3 · </span>
            {t(locale, "styling.decor")}
          </p>
          <p id={decorHelpId} className="text-sm text-ink-2">{t(locale, "styling.decorHelp")}</p>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t(locale, "styling.decor")}
          aria-describedby={decorHelpId}
        >
          {[null, ...DECOR_LEVELS].map((level) => (
            <button
              key={level ?? "default"}
              type="button"
              onClick={() => onChange({ ...value, decor: level })}
              disabled={disabled}
              aria-pressed={value.decor === level}
              className={`${OPTION} ${value.decor === level ? ON : OFF} inline-flex items-center gap-2`}
            >
              {level !== null && <DecorDots filled={DECOR_DOTS[level]} of={3} />}
              {t(locale, `styling.decorLevel.${level ?? "default"}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {wishRoom ? (
            <label htmlFor={wishesId} className={LABEL}>
              <span className="text-ink-2">4 · </span>
              {t(locale, "styling.wishes")}
            </label>
          ) : (
            <p className={LABEL}>
              <span className="text-ink-2">4 · </span>
              {t(locale, "styling.wishes")}
            </p>
          )}
          {!wishRoom && <p className="text-sm text-ink-2">{t(locale, "styling.wishesOnlyLiving")}</p>}
        </div>
        {wishRoom && (
          <div className="space-y-2.5">
            <p id={wishesHelpId} className="text-sm text-ink-2">{t(locale, "styling.wishesHelp")}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "styling.wishesSuggestions")}>
              {wishSuggestions(value.furnishAs).map((id) => {
                const next = addSuggestion(value.wishes, id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      if (next !== null) onChange({ ...value, wishes: next });
                    }}
                    disabled={disabled || next === null}
                    className={`${OPTION} ${OFF}`}
                  >
                    {t(locale, `styling.wish.${id}`)}
                  </button>
                );
              })}
            </div>
            {/* scroll-mb: feltet havner ikke bak den faste bestillingslinja naar det faar fokus. */}
            <textarea
              id={wishesId}
              rows={3}
              value={value.wishes}
              onChange={(e) => onChange({ ...value, wishes: clampWishes(e.target.value) })}
              disabled={disabled}
              aria-describedby={`${wishesHelpId} ${wishesCountId}`}
              className="block w-full scroll-mb-28 rounded-button border border-line-strong bg-surface px-3 py-2 text-sm text-ink disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            <p id={wishesCountId} className="text-right text-xs text-ink-2 tabular-nums">
              {t(locale, "styling.wishesCount", { n: Math.min(wishesLength(value.wishes), WISHES_MAX) })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
