import type { ImageKey, VideoKey } from "./schema.ts";

/**
 * Videoene paa markedssiden (F1, TG-NEW-230). Ingen import utenom typer, saa
 * node --test kan laste fila. Plakaten er en noekkel i images.ts; kalleren
 * gir MarketingVideo `IMAGES[poster].src`.
 *
 * Filene ligger i public/no/film/, ikke i content/: matcheren i proxy.ts
 * unntar ikke .mp4, saa proxyen kjoerer paa dem. Under /no/ slippes de
 * gjennom av isOpenMarketingPath ved lansering, og til da er de bak
 * innlogging som resten av markedssiden. Aa endre matcheren er roedt.
 * Filnavnene har ikke merket (testen for merkenavnet, valg A 20.10).
 *
 * Begge videoene viser styling-bildet (pairStyling*, midlertidig). Der de
 * brukes, skal de derfor ha pending: "image" til bildet er byttet.
 */
export const VIDEOS: Record<VideoKey, { src: string; poster: ImageKey; width: number; height: number }> = {
  film: { src: "/no/film/film-1080p.mp4", poster: "filmPoster", width: 1920, height: 1080 },
  loop: { src: "/no/film/lokke-480p.mp4", poster: "loopPoster", width: 720, height: 480 },
};
