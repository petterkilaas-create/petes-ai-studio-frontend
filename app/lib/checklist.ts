import type { AdditionsLevel } from "./api";
import type { UiKey } from "./i18n/index.ts";
import { additionsView } from "./additions.ts";
import { presetLabelKey } from "./presets.ts";
import { isStylingPreset } from "./styling.ts";

/**
 * Sjekklista og krysset foer «Godkjenn» (D-5a, Petter 25.10, AVVIK 2 a og
 * §3 b). Én liste per tjeneste; tekstene staar i ordlista og er generert fra
 * sjekklister_v2.json (kopi i testdata/; v2 la til peisen i kveldsbilde, Dag 55).
 * Rene funksjoner, saa de kan testes med node --test.
 */

export type ChecklistId = "styling" | "kveldsbilde" | "blaa_himmel";

/** Punktene i hver liste, i rekkefoelgen fra sjekklister_v2.json. */
export const CHECKLISTS: Readonly<Record<ChecklistId, readonly UiKey[]>> = {
  styling: [
    "checklist.styling.1",
    "checklist.styling.2",
    "checklist.styling.3",
    "checklist.styling.4",
    "checklist.styling.5",
  ],
  kveldsbilde: [
    "checklist.kveldsbilde.1",
    "checklist.kveldsbilde.2",
    "checklist.kveldsbilde.3",
    "checklist.kveldsbilde.4",
    "checklist.kveldsbilde.5",
  ],
  blaa_himmel: ["checklist.blaa_himmel.1", "checklist.blaa_himmel.2", "checklist.blaa_himmel.3"],
};

/**
 * Lista for jobben, valgt paa samme maate som siden ellers skiller
 * tjenestene: styling paa `styling_`-prefikset (isStylingPreset, som
 * «Detaljer» og rundeetiketten), skumring og Klart vaer paa oppskriften i
 * presets.ts (som etiketten og filnavnet). Uten `preset_id` (eldre jobber)
 * gjelder reserven der, skumring. Ukjent oppskrift: ingen liste, bare krysset.
 */
export function checklistFor(presetId: string | null | undefined): ChecklistId | null {
  if (isStylingPreset(presetId)) return "styling";
  switch (presetLabelKey("scene_transform", presetId)) {
    case "service.scene_transform":
      return "kveldsbilde";
    case "express.tool.klart_vaer.title":
      return "blaa_himmel";
    default:
      return null;
  }
}

/** Teksten paa krysset: ved advarsel gjelder det ogsaa de markerte stedene. */
export function comparedKey(level: AdditionsLevel): UiKey {
  return additionsView(level).needsAck ? "checklist.comparedWarning" : "checklist.compared";
}
