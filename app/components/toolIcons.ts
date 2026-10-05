import { Eraser, ScanFace, Sun, Sunset, type LucideIcon } from "lucide-react";

/**
 * Ikonet for hvert verktoey (id-en i ENABLED, lib/services.ts), delt av
 * Tjenester og snarveiene paa /start (TG-NEW-153). Ukjent id: ingen ikon.
 */
export const TOOL_ICONS: Record<string, LucideIcon> = {
  magic_cleanup: Eraser,
  privacy_blur: ScanFace,
  klart_vaer: Sun,
  skumring: Sunset,
};
