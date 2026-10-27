import {
  Armchair,
  Clock,
  Ellipsis,
  Eraser,
  FileText,
  Images,
  Leaf,
  ScanFace,
  Sofa,
  Sun,
  Sunset,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * Ikonet for hvert verktoey (id-en i ENABLED, lib/services.ts), delt av
 * Tjenester og snarveiene paa /start (TG-NEW-153). Ukjent id: ingen ikon.
 */
export const TOOL_ICONS: Record<string, LucideIcon> = {
  magic_cleanup: Eraser,
  privacy_blur: ScanFace,
  klart_vaer: Sun,
  skumring: Sunset,
  aarstider: Leaf,
  // «Kommer»-kortene (dag 45).
  digital_styling: Sofa,
  same_furniture_angles: Images,
  video: Video,
  copywriter: FileText,
};

/** Ikonet for hver kategori paa Tjenester (flyttet fra tjenester/page.tsx). Ukjent id: ingen ikon. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  timetraveler: Clock,
  fixit: Eraser,
  furnishing: Armchair,
  more: Ellipsis,
  privacy: ScanFace,
};
