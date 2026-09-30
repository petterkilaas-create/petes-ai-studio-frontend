/**
 * Liten ordliste for nb og en (2d-1, Petter 28.09). Backend sender bare
 * koder og data, aldri tekst ment for brukeren; all tekst og alle koder
 * oversettes her. Rene funksjoner uten import, saa modulen kan testes med
 * node --test.
 *
 * Spraak velges foreloepig fra nettleseren (se useLocale). Spraakvelger,
 * lagret spraakvalg og oversettelse av eksisterende sider er TG-NEW-129.
 *
 * Nye tekster: legg inn i BAADE nb og en. `Dictionary` krever samme
 * ui-noekler i begge, og en test sjekker at kodegruppene har samme koder.
 */

export type Locale = "nb" | "en";

/** Standardspraak foer nettleseren er lest (server-render). */
export const DEFAULT_LOCALE: Locale = "nb";

export type CodeGroup =
  | "reviewCode"
  | "reasonCode"
  | "flagCode"
  | "lightType"
  | "lightReason"
  | "imageType"
  | "skyVisibility"
  | "decisionError"
  | "overrideCode"
  | "duskTime"
  | "duskSky"
  | "disclosureBase"
  | "disclosureTime"
  | "disclosureEdited";

const nbUi = {
  "review.title": "Kontroll av bildet",
  "review.back": "Tilbake til historikk",
  "review.loading": "Henter jobben…",
  "review.notFound": "Fant ikke jobben",
  "review.notFoundHint": "Jobben finnes ikke, eller den tilhører en annen bruker.",
  "review.unavailable": "Kontrollen er ikke tilgjengelig akkurat nå. Prøv igjen senere.",
  "review.loadError": "Kunne ikke hente jobben.",
  "review.retry": "Prøv igjen",
  "review.original": "Original",
  "review.result": "Resultat",
  "review.noImage": "Ikke noe bilde",
  "preview.notReady": "Forhåndsvisningen er ikke klar ennå. Last inn siden på nytt.",
  "review.variantLifted": "Løftet",
  "review.variantRaw": "Rått",
  "review.reasons": "Hvorfor jobben venter",
  "review.notes": "Merknader fra analysen",
  "review.imageType": "Bildetype",
  "review.runValues": "Analysene svarte: {values}",
  "review.sky": "Himmel",
  "review.fireplace": "Peis",
  "review.fireplaceNone": "Analysen fant ingen peis.",
  "review.fireplacePresent": "Analysen fant peis.",
  "review.fireplaceDisagreement": "Analysene var uenige om bildet har peis.",
  "review.fireplaceAnswered": "Svar på peis: {answer}",
  "review.lights": "Lyskilder",
  "review.lightsApproved": "Godkjente",
  "review.lightsUnstable": "Ustabile (ikke sett i begge analysene)",
  "review.lightsRejected": "Avviste",
  "review.lightsEmpty": "Ingen",
  "review.noValidRuns": "Analysen ga ikke noe svar, så ingen lyskilder er bekreftet.",
  "review.decided": "Avgjort",
  "review.statusSucceeded": "Fullført. Bildet er godkjent.",
  "review.statusRejected": "Avvist av deg",
  "review.statusRunning": "Lager nytt bilde…",
  "review.statusOther": "Jobben venter ikke på deg nå.",
  "review.reasonLabel": "Begrunnelse",
  "review.previousRound": "Forrige runde",
  "review.lightPromoted": "Slått på av deg",
  "review.lightDisabled": "Slått av av deg",
  "action.approve": "Godkjenn",
  "action.reject": "Avvis",
  "action.continue": "Send videre",
  "action.cancel": "Avbryt",
  "action.confirmReject": "Bekreft avvisning",
  "action.working": "Sender…",
  "action.newImage": "Dette lager et nytt bilde.",
  "action.fireplaceQuestion": "Skal peisen være tent?",
  "action.fireplaceLit": "Tent",
  "action.fireplaceNotLit": "Ikke tent",
  "action.fireplaceNotLitHint": "Velger du «Ikke tent», slukkes ilden hvis den brenner i originalen.",
  "action.reasonPlaceholder": "Begrunnelse (valgfri)",
  "action.reasonCount": "{n} av {max} tegn",
  "action.reasonTooLong": "Begrunnelsen kan være høyst {max} tegn.",
  "action.noneAllowed": "Ingen handlinger er tilgjengelige for denne jobben.",
  "action.correct": "Rett",
  "action.makeNewImage": "Lag nytt bilde",
  "correct.title": "Rett lyskildene",
  "correct.hint": "Slå lyskildene av eller på i listen over lyskilder.",
  "correct.roundsLeft": "Runder igjen: {n}",
  "correct.newImageFromOriginal": "Dette lager et nytt bilde fra originalen.",
  "correct.confirmExists": "Jeg bekrefter at lyskildene jeg har slått på, finnes i originalbildet.",
  "correct.lightOn": "På",
  "correct.lightOff": "Av",
  "correct.locked": "Kan ikke endres",
  "correct.roundFailed": "Det nye bildet kunne ikke lages. Du har fortsatt forrige bilde, og runden er ikke brukt.",
  "decision.statusChanged": "Jobben ble endret i mellomtiden. Siden er oppdatert. Se over den før du velger på nytt.",
  "decision.error": "Noe gikk galt. Prøv igjen senere.",
  "express.openReview": "Åpne kontroll",
  "history.waitingForMe": "Venter på meg",
  "history.all": "Alle",
  "history.openReview": "Åpne kontroll",
  "history.rejectedByYou": "Avvist av deg",
  "history.emptyWaiting": "Ingen jobber venter på deg.",
  "status.rejectedByYou": "Avvist av deg",
  "job.failed": "Bildet kunne ikke behandles. Prøv igjen, eller kontakt oss.",
  "job.rejected": "Bildet passet ikke for dette verktøyet og ble ikke laget.",
  "history.loadError": "Noe gikk galt. Prøv igjen om litt.",
  "dusk.title": "Stemning",
  "dusk.time": "Tidspunkt",
  "dusk.sky": "Himmel",
  "dusk.hint": "Himmelen brukes bare hvis bildet har synlig himmel.",
  "review.duskTitle": "Valgt stemning",
  "review.duskSkyNotApplied": "ikke brukt (ingen himmel i bildet)",
  "review.analysisTitle": "Analyse",
  "review.readOnlyOther": "Du ser en annen brukers jobb. Bare lesing.",
  "review.statusRejectedByOwner": "Avvist av eieren",
  "history.subtitle": "Alle jobbene dine, nyeste først.",
  "history.subtitleAll": "Alle brukeres jobber, nyeste først.",
  "history.scope.mine": "Mine jobber",
  "history.scope.all": "Alle brukere",
  "history.waiting": "Venter",
  "history.emptyWaitingAll": "Ingen jobber venter.",
  "history.notYours": "Annen bruker",
  "history.owner": "Eier",
  "history.rejectedByOwner": "Avvist av eieren",
  "history.scopeFallback": "Du har ikke tilgang til alle brukeres jobber. Viser dine jobber.",
  "review.disclosureTitle": "Tekst til annonsen",
  "review.disclosureHelp": "Lim den inn i annonsen sammen med bildet.",
  "review.disclosureMissing": "Merketeksten kunne ikke lages. Kontakt oss.",
  "action.copy": "Kopier",
  "review.copied": "Kopiert",
  "review.copyFailed": "Kunne ikke kopiere. Marker teksten og kopier den selv.",
  "review.download": "Last ned merket bilde",
  "review.downloading": "Laster ned …",
  "review.downloadFailed": "Kunne ikke laste ned bildet. Prøv igjen om litt.",
  "review.downloadNotAllowed": "Bare eieren av jobben kan laste ned bildet.",
  "review.downloadBroken": "Bildet kunne ikke hentes. Kontakt oss.",
  "history.open": "Åpne",
  "unavailable.title": "Midlertidig ikke tilgjengelig",
  "unavailable.body": "Denne tjenesten er midlertidig ikke tilgjengelig.",
  "unavailable.toExpress": "Gå til Express",
  // Forsiden og Express lover bare det som leveres (dag 33, L0b).
  "home.titlePrefix": "Velkommen til The",
  "home.titleHighlight": "Studio",
  "home.intro": "Velg en tjeneste for å starte. Redigering av boligfoto: kveldsbilde laget med AI fra dagsbilde, og sladding av personlige detaljer.",
  "home.express.title": "Express",
  "home.express.desc": "Kveldsbilde laget med AI fra dagsbilde, og sladding av ansikter, familiebilder og bilskilt.",
  "home.express.cta": "Kom i gang",
  "express.subtitle": "Kveldsbilde laget med AI fra dagsbilde, og sladding av personlige detaljer.",
} as const;

export type UiKey = keyof typeof nbUi;

interface Dictionary {
  ui: Record<UiKey, string>;
  codes: Record<CodeGroup, Record<string, string>>;
  /** Generisk tekst per gruppe naar koden er ukjent. */
  generic: Record<CodeGroup, string>;
}

const nb: Dictionary = {
  ui: nbUi,
  codes: {
    reviewCode: {
      gate_review: "Bildet må sjekkes før vi lager det.",
      fireplace_answer_missing: "Venter på svar om peisen.",
      needs_review: "Bildet må sjekkes før vi lager det.",
    },
    reasonCode: {
      valid_runs_insufficient: "Analysen ga ufullstendig svar.",
      analysis_uncertain: "Analysen var usikker.",
      image_type_disagreement: "Analysen var uenig om hva slags bilde dette er.",
      image_type_untested: "Denne bildetypen støttes ikke ennå.",
      fireplace_present: "Analysen fant peis.",
      fireplace_disagreement: "Analysen var uenig om bildet har peis.",
    },
    flagCode: {
      sky_visibility_disagreement: "Analysen var uenig om hvor mye himmel som synes.",
      fireplace_disagreement: "Analysen var uenig om bildet har peis.",
    },
    lightType: {
      pendant: "Pendel",
      ceiling_light: "Taklampe",
      spotlight: "Spotlight",
      table_lamp: "Bordlampe",
      floor_lamp: "Gulvlampe",
      wall_sconce: "Vegglampe",
      exterior_wall_lamp: "Utvendig vegglampe",
      garden_or_path_light: "Hage- eller gangsti-lys",
      street_light: "Gatelys",
      string_lights: "Lysslynge",
      candle: "Stearinlys",
      lantern: "Lykt",
      other_fixture: "Annen lyskilde",
    },
    lightReason: {
      not_confirmed: "Ikke bekreftet av begge analysene",
    },
    imageType: {
      interior: "Interiør",
      exterior_facade: "Fasade",
      balcony_terrace: "Balkong eller terrasse",
      aerial: "Flyfoto",
      other: "Annet",
    },
    skyVisibility: {
      none: "Ingen himmel",
      limited: "Litt himmel",
      large: "Mye himmel",
    },
    decisionError: {
      action_not_allowed: "Denne handlingen er ikke tillatt for jobben nå.",
      status_changed: "Jobben ble endret i mellomtiden. Siden er oppdatert. Se over den før du velger på nytt.",
      invalid_decision: "Forespørselen var ugyldig. Sjekk valgene og prøv igjen.",
      original_missing: "Originalbildet mangler, så vi kan ikke lage et nytt bilde.",
      correction_limit: "Du har brukt rundene dine.",
      archive_failed: "Det nye bildet kunne ikke startes. Prøv igjen.",
    },
    overrideCode: {
      too_many_lights: "For mange lyskilder er slått på. Slå av noen og prøv igjen.",
    },
    duskTime: {
      early: "Tidlig skumring",
      late: "Sen kveld",
    },
    duskSky: {
      clear: "Klar blå time",
      light_clouds: "Lette skyer",
      pink_clouds: "Rosa skyer",
      dark: "Mørk kveldshimmel",
      starry: "Stjernehimmel",
    },
    // Merketeksten (merking PR 2). Settes sammen i app/lib/disclosure.ts,
    // som aldri bruker den generiske teksten: ukjent kode gir ingen tekst.
    disclosureBase: {
      evening_from_day: "Kveldsbilde laget med AI fra dagsbilde.",
    },
    disclosureTime: {
      early: "Tidspunkt: tidlig skumring.",
      late: "Tidspunkt: sen kveld.",
    },
    disclosureEdited: {
      sky: "himmel",
      window_lights: "lys i vinduer",
      neighbour_window_lights: "lys i nabohus",
      exterior_lamps: "utelys",
      interior_lamps: "lamper i rommet",
      candles: "stearinlys",
      fireplace_fire: "ild i peisen",
    },
  },
  generic: {
    reviewCode: "Bildet må sjekkes.",
    reasonCode: "Annen grunn.",
    flagCode: "Annen merknad.",
    lightType: "Lyskilde",
    lightReason: "Ikke godkjent",
    imageType: "Ukjent bildetype",
    skyVisibility: "Ukjent",
    decisionError: "Noe gikk galt. Prøv igjen senere.",
    overrideCode: "Valgene kunne ikke brukes. Last siden på nytt og prøv igjen.",
    duskTime: "Ukjent tidspunkt",
    duskSky: "Ukjent himmel",
    disclosureBase: "Merketeksten kunne ikke lages.",
    disclosureTime: "Merketeksten kunne ikke lages.",
    disclosureEdited: "Merketeksten kunne ikke lages.",
  },
};

const en: Dictionary = {
  ui: {
    "review.title": "Image review",
    "review.back": "Back to history",
    "review.loading": "Loading the job…",
    "review.notFound": "Job not found",
    "review.notFoundHint": "The job does not exist, or it belongs to another user.",
    "review.unavailable": "Review is not available right now. Please try again later.",
    "review.loadError": "Could not load the job.",
    "review.retry": "Try again",
    "review.original": "Original",
    "review.result": "Result",
    "review.noImage": "No image",
    "preview.notReady": "Preview not ready yet. Reload the page.",
    "review.variantLifted": "Enhanced",
    "review.variantRaw": "Raw",
    "review.reasons": "Why the job is waiting",
    "review.notes": "Notes from the analysis",
    "review.imageType": "Image type",
    "review.runValues": "The analyses answered: {values}",
    "review.sky": "Sky",
    "review.fireplace": "Fireplace",
    "review.fireplaceNone": "The analysis found no fireplace.",
    "review.fireplacePresent": "The analysis found a fireplace.",
    "review.fireplaceDisagreement": "The analyses disagreed on whether there is a fireplace.",
    "review.fireplaceAnswered": "Fireplace answer: {answer}",
    "review.lights": "Light sources",
    "review.lightsApproved": "Approved",
    "review.lightsUnstable": "Unstable (not seen in both analyses)",
    "review.lightsRejected": "Rejected",
    "review.lightsEmpty": "None",
    "review.noValidRuns": "The analysis gave no answer, so no light sources are confirmed.",
    "review.decided": "Decided",
    "review.statusSucceeded": "Completed. The image is approved.",
    "review.statusRejected": "Rejected by you",
    "review.statusRunning": "Creating a new image…",
    "review.statusOther": "This job is not waiting for you right now.",
    "review.reasonLabel": "Reason",
    "review.previousRound": "Previous round",
    "review.lightPromoted": "Turned on by you",
    "review.lightDisabled": "Turned off by you",
    "action.approve": "Approve",
    "action.reject": "Reject",
    "action.continue": "Continue",
    "action.cancel": "Cancel",
    "action.confirmReject": "Confirm rejection",
    "action.working": "Sending…",
    "action.newImage": "This creates a new image.",
    "action.fireplaceQuestion": "Should the fireplace be lit?",
    "action.fireplaceLit": "Lit",
    "action.fireplaceNotLit": "Not lit",
    "action.fireplaceNotLitHint": "If you choose \"Not lit\", a fire burning in the original will be put out.",
    "action.reasonPlaceholder": "Reason (optional)",
    "action.reasonCount": "{n} of {max} characters",
    "action.reasonTooLong": "The reason can be at most {max} characters.",
    "action.noneAllowed": "No actions are available for this job.",
    "action.correct": "Correct",
    "action.makeNewImage": "Create new image",
    "correct.title": "Correct the light sources",
    "correct.hint": "Turn the light sources on or off in the list of light sources.",
    "correct.roundsLeft": "Rounds left: {n}",
    "correct.newImageFromOriginal": "This creates a new image from the original.",
    "correct.confirmExists": "I confirm that the light sources I have turned on exist in the original image.",
    "correct.lightOn": "On",
    "correct.lightOff": "Off",
    "correct.locked": "Cannot be changed",
    "correct.roundFailed": "The new image could not be created. You still have the previous image, and the round has not been used.",
    "decision.statusChanged": "The job changed in the meantime. The page has been updated. Review it before choosing again.",
    "decision.error": "Something went wrong. Please try again later.",
    "express.openReview": "Open review",
    "history.waitingForMe": "Waiting for me",
    "history.all": "All",
    "history.openReview": "Open review",
    "history.rejectedByYou": "Rejected by you",
    "history.emptyWaiting": "No jobs are waiting for you.",
    "status.rejectedByYou": "Rejected by you",
    "job.failed": "The image could not be processed. Please try again, or contact us.",
    "job.rejected": "The image did not suit this tool and was not created.",
    "history.loadError": "Something went wrong. Please try again shortly.",
    "dusk.title": "Mood",
    "dusk.time": "Time",
    "dusk.sky": "Sky",
    "dusk.hint": "The sky is only used if the image has visible sky.",
    "review.duskTitle": "Chosen mood",
    "review.duskSkyNotApplied": "not used (no sky in the image)",
    "review.analysisTitle": "Analysis",
    "review.readOnlyOther": "You are viewing another user's job. Read only.",
    "review.statusRejectedByOwner": "Rejected by the owner",
    "history.subtitle": "All your jobs, newest first.",
    "history.subtitleAll": "All users' jobs, newest first.",
    "history.scope.mine": "My jobs",
    "history.scope.all": "All users",
    "history.waiting": "Waiting",
    "history.emptyWaitingAll": "No jobs are waiting.",
    "history.notYours": "Other user",
    "history.owner": "Owner",
    "history.rejectedByOwner": "Rejected by the owner",
    "history.scopeFallback": "You do not have access to all users' jobs. Showing your jobs.",
    "review.disclosureTitle": "Text for the listing",
    "review.disclosureHelp": "Paste it into the listing together with the image.",
    "review.disclosureMissing": "The disclosure text could not be created. Please contact us.",
    "action.copy": "Copy",
    "review.copied": "Copied",
    "review.copyFailed": "Could not copy. Select the text and copy it yourself.",
    "review.download": "Download labelled image",
    "review.downloading": "Downloading …",
    "review.downloadFailed": "Could not download the image. Please try again shortly.",
    "review.downloadNotAllowed": "Only the job owner can download the image.",
    "review.downloadBroken": "The image could not be retrieved. Please contact us.",
    "history.open": "Open",
    "unavailable.title": "Temporarily unavailable",
    "unavailable.body": "This service is temporarily unavailable.",
    "unavailable.toExpress": "Go to Express",
    "home.titlePrefix": "Welcome to the",
    "home.titleHighlight": "Studio",
    "home.intro": "Select a product below to begin. Real estate photo editing: dusk image made with AI from a daytime photo, and privacy blur.",
    "home.express.title": "Express",
    "home.express.desc": "Dusk image made with AI from a daytime photo, and blurring of faces, family photos and license plates.",
    "home.express.cta": "Get started",
    "express.subtitle": "Dusk image made with AI from a daytime photo, and privacy blur.",
  },
  codes: {
    reviewCode: {
      gate_review: "The image needs a check before we create it.",
      fireplace_answer_missing: "Waiting for an answer about the fireplace.",
      needs_review: "The image needs a check before we create it.",
    },
    reasonCode: {
      valid_runs_insufficient: "The analysis gave an incomplete answer.",
      analysis_uncertain: "The analysis was uncertain.",
      image_type_disagreement: "The analysis disagreed on what kind of image this is.",
      image_type_untested: "This image type is not supported yet.",
      fireplace_present: "The analysis found a fireplace.",
      fireplace_disagreement: "The analysis disagreed on whether the image has a fireplace.",
    },
    flagCode: {
      sky_visibility_disagreement: "The analysis disagreed on how much sky is visible.",
      fireplace_disagreement: "The analysis disagreed on whether the image has a fireplace.",
    },
    lightType: {
      pendant: "Pendant",
      ceiling_light: "Ceiling light",
      spotlight: "Spotlight",
      table_lamp: "Table lamp",
      floor_lamp: "Floor lamp",
      wall_sconce: "Wall sconce",
      exterior_wall_lamp: "Exterior wall lamp",
      garden_or_path_light: "Garden or path light",
      street_light: "Street light",
      string_lights: "String lights",
      candle: "Candle",
      lantern: "Lantern",
      other_fixture: "Other light source",
    },
    lightReason: {
      not_confirmed: "Not confirmed by both analyses",
    },
    imageType: {
      interior: "Interior",
      exterior_facade: "Facade",
      balcony_terrace: "Balcony or terrace",
      aerial: "Aerial photo",
      other: "Other",
    },
    skyVisibility: {
      none: "No sky",
      limited: "Some sky",
      large: "Lots of sky",
    },
    decisionError: {
      action_not_allowed: "This action is not allowed for the job right now.",
      status_changed: "The job changed in the meantime. The page has been updated. Review it before choosing again.",
      invalid_decision: "The request was invalid. Check your choices and try again.",
      original_missing: "The original image is missing, so we cannot create a new image.",
      correction_limit: "You have used your rounds.",
      archive_failed: "The new image could not be started. Please try again.",
    },
    overrideCode: {
      too_many_lights: "Too many light sources are turned on. Turn some off and try again.",
    },
    duskTime: {
      early: "Early dusk",
      late: "Late evening",
    },
    duskSky: {
      clear: "Clear blue hour",
      light_clouds: "Light clouds",
      pink_clouds: "Pink clouds",
      dark: "Dark evening sky",
      starry: "Starry sky",
    },
    disclosureBase: {
      evening_from_day: "Evening image created with AI from a daytime photo.",
    },
    disclosureTime: {
      early: "Time of day: early dusk.",
      late: "Time of day: late evening.",
    },
    disclosureEdited: {
      sky: "sky",
      window_lights: "lights in windows",
      neighbour_window_lights: "lights in neighbouring houses",
      exterior_lamps: "outdoor lights",
      interior_lamps: "lamps in the room",
      candles: "candles",
      fireplace_fire: "fire in the fireplace",
    },
  },
  generic: {
    reviewCode: "The image needs a check.",
    reasonCode: "Other reason.",
    flagCode: "Other note.",
    lightType: "Light source",
    lightReason: "Not approved",
    imageType: "Unknown image type",
    skyVisibility: "Unknown",
    decisionError: "Something went wrong. Please try again later.",
    overrideCode: "Your choices could not be used. Reload the page and try again.",
    duskTime: "Unknown time",
    duskSky: "Unknown sky",
    disclosureBase: "The disclosure text could not be created.",
    disclosureTime: "The disclosure text could not be created.",
    disclosureEdited: "The disclosure text could not be created.",
  },
};

export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { nb, en };

const NORWEGIAN = new Set(["nb", "no", "nn"]);

/**
 * Spraak fra nettleserens foerstevalg: nb, no og nn (ogsaa med region,
 * f.eks. nb-NO) gir norsk, alt annet engelsk.
 */
export function pickLocale(languages: readonly string[] | null | undefined): Locale {
  const first = languages?.[0];
  if (typeof first !== "string") return "en";
  const primary = first.toLowerCase().split(/[-_]/)[0];
  return NORWEGIAN.has(primary) ? "nb" : "en";
}

/** Tekst for en ui-noekkel. `{navn}` byttes med verdien i `vars`. */
export function t(
  locale: Locale,
  key: UiKey,
  vars?: Record<string, string | number>
): string {
  const text = DICTIONARIES[locale].ui[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match
  );
}

/**
 * Oversatt tekst for en kode fra backend. Ukjent, tom eller manglende kode
 * gir gruppens generiske tekst, aldri krasj. hasOwn: "__proto__" og
 * "toString" skal ikke treffe prototypen.
 */
export function codeText(locale: Locale, group: CodeGroup, code: unknown): string {
  const dict = DICTIONARIES[locale];
  const table = dict.codes[group];
  if (typeof code === "string" && Object.hasOwn(table, code)) {
    return table[code];
  }
  return dict.generic[group];
}

/** Melding som enten er en ui-noekkel eller en kode fra backend. */
export type Message = { key: UiKey } | { group: CodeGroup; code: unknown };

/** Tekst for en Message: ui-noekkel via t, kode via codeText (aldri krasj). */
export function messageText(locale: Locale, message: Message): string {
  return "key" in message ? t(locale, message.key) : codeText(locale, message.group, message.code);
}
