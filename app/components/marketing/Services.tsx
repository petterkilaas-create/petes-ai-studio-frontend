import Image from "next/image";
import { ArrowRight, PenLine, Play } from "lucide-react";
import { IMAGES } from "../../../content/marketing/images";
import type { ServiceMedia, Services as ServicesContent, Site } from "../../../content/marketing/schema";
import { VIDEOS } from "../../../content/marketing/videos";
import { MarketingVideo } from "./MarketingVideo";
import { PendingMark } from "./PendingMark";
import { PlanIllustration } from "./PlanIllustration";
import { CONTAINER, FOCUS, H2, LEAD, SECTION_Y } from "./classes";

/**
 * Tjenestene som seks kort i studioer (F4, designet Main.dc.html linje
 * 104-256). Serverkomponent; bare videoloekka kjoerer i nettleseren. All
 * tekst kommer fra innholdet (home.services).
 *
 * Alle tjenestene vises som om de er klare (Petter dag 48). En `available`
 * har bestillingslenken til site.cta, de andre «Få tidlig tilgang» til
 * kontaktsiden. Lenken peker paa kortets h3 (aria-describedby), saa de like
 * lenketekstene kan skilles i en skjermleser.
 *
 * Mediet er 230 px hoeyt, saa plassen er satt foer bildene kommer (CLS). I
 * de delte bildene ligger resultatet under og vises helt, og originalen
 * ligger over og klippes til hoeyre halvdel. Resultatet staar altsaa til
 * venstre, speilvendt fra designet, fordi det ekte AI-merket staar nede til
 * venstre i kveldsbildet og maa synes (auditen §3). Begge bildene har samme
 * utsnitt nede til venstre (object-left-bottom), saa halvdelene ligger likt.
 * AI-lappen oeverst til venstre er et tillegg og erstatter ikke merket i
 * bildet. Bildet i annonseteksten har ingen lapp, som i mosaikken.
 */

const SIZES = "(min-width: 1320px) 400px, (min-width: 1024px) 31vw, (min-width: 768px) 47vw, 100vw";

/** Samme stil som hovedknappen i toppen (Hero.tsx). */
const BIG_BUTTON = `flex h-[54px] items-center gap-2.5 self-start rounded-[12px] bg-primary px-6 text-[16.5px] font-semibold text-on-primary no-underline hover:opacity-90 ${FOCUS}`;

const MEDIA = "relative h-[230px] overflow-hidden";

const TAG =
  "pointer-events-none absolute top-2.5 inline-flex items-center gap-1.5 rounded-pill bg-ink/75 px-2.5 py-1 text-[12px] font-semibold text-surface";

/** AI-sirkelen i etiketten: lys paa den moerke lappen, som i designet (ikke AI_CHIP i classes.ts). */
const AI_DOT =
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-surface text-[12px] font-bold tracking-[-0.02em] text-ink";

/** Om et medium viser et midlertidig bilde (lappen [BILDE] under kortene). */
function isPending(media: ServiceMedia): boolean {
  if (media.kind === "split") return Boolean(media.after.pending || media.before.pending);
  if (media.kind === "video") return Boolean(media.video.pending);
  if (media.kind === "ad") return Boolean(media.image.pending);
  return false;
}

function Media({ media, aiLabel, site }: { media: ServiceMedia; aiLabel: string; site: Site }) {
  if (media.kind === "split") {
    return (
      <div className={`${MEDIA} bg-surface-2`}>
        <Image
          src={IMAGES[media.after.image]}
          alt={media.after.alt}
          fill
          sizes={SIZES}
          className="object-cover object-left-bottom"
        />
        <div className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
          <Image
            src={IMAGES[media.before.image]}
            alt={media.before.alt}
            fill
            sizes={SIZES}
            className="object-cover object-left-bottom"
          />
        </div>
        <div aria-hidden="true" className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-surface" />
        <span className={`${TAG} left-2.5 pl-1`}>
          <span aria-hidden="true" className={AI_DOT}>
            {aiLabel}
          </span>
          {media.labels.after}
        </span>
        <span className={`${TAG} right-2.5`}>{media.labels.before}</span>
      </div>
    );
  }
  if (media.kind === "video") {
    return (
      <div className={`${MEDIA} bg-night`}>
        <MarketingVideo
          src={VIDEOS.loop.src}
          poster={IMAGES.loopPoster.src}
          label={media.video.label}
          mode="loop"
          labels={site.video}
        />
        <span className={`${TAG} left-2.5`}>
          <Play aria-hidden="true" className="size-3.5 fill-current" strokeWidth={0} />
          {media.label}
        </span>
      </div>
    );
  }
  if (media.kind === "ad") {
    return (
      <div className={`${MEDIA} box-border flex items-center gap-4 bg-ink p-[18px] text-paper`}>
        <div className="relative h-[176px] w-[132px] shrink-0 overflow-hidden rounded-[10px]">
          <Image
            src={IMAGES[media.image.image]}
            alt={media.image.alt}
            fill
            sizes="132px"
            className="object-cover object-left-bottom"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="m-0 inline-flex items-center gap-1.5 self-start rounded-pill bg-amber-bg px-2.5 py-1 text-[12px] font-semibold text-amber-fg">
            <PenLine aria-hidden="true" className="size-3" strokeWidth={2} />
            {media.label}
          </p>
          <p className="m-0 font-display text-[23px] leading-[26px]">{media.title}</p>
          <p className="m-0 text-[13px] leading-[19px] text-paper/75">{media.excerpt}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`${MEDIA} box-border flex items-center justify-center bg-paper p-3.5`}>
      <PlanIllustration plan={media} />
    </div>
  );
}

export function Services({ services, site }: { services: ServicesContent; site: Site }) {
  const pending = services.items.some((s) => isPending(s.media));
  return (
    <section id={services.anchor} aria-labelledby={`${services.anchor}-tittel`} className={SECTION_Y}>
      <div className={`${CONTAINER} flex flex-col gap-10`}>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-[640px] flex-col gap-3">
            <h2 id={`${services.anchor}-tittel`} className={H2}>
              {services.title}
            </h2>
            <p className={LEAD}>{services.lead}</p>
          </div>
          <a href={site.cta.href} className={`${BIG_BUTTON} shrink-0`}>
            {site.cta.label}
            <ArrowRight aria-hidden="true" className="size-[18px]" strokeWidth={2} />
          </a>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {services.items.map((s) => {
            const titleId = `${services.anchor}-${s.id}`;
            const link = s.status === "available" ? { label: s.orderLabel, href: site.cta.href } : services.earlyAccess;
            return (
              <article
                key={s.id}
                className="flex flex-col overflow-hidden rounded-card border border-line bg-surface"
              >
                <Media media={s.media} aiLabel={services.aiLabel} site={site} />
                <div className="flex grow flex-col gap-2 p-5">
                  <p className="m-0 text-[12px] font-medium uppercase tracking-[0.05em] text-neutral-fg">{s.studio}</p>
                  <h3 id={titleId} className="m-0 text-[21px] font-semibold leading-[27px] text-ink">
                    {s.title}
                  </h3>
                  <p className="m-0 grow text-[15.5px] leading-[1.55] text-ink-2">{s.text}</p>
                  <a
                    href={link.href}
                    aria-describedby={titleId}
                    className={`self-start rounded-button text-[15px] font-semibold text-ink underline underline-offset-[3px] ${FOCUS}`}
                  >
                    {link.label}
                  </a>
                </div>
              </article>
            );
          })}
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[15px] text-ink-2">
          <span className="font-semibold text-ink">{services.also.label}</span>
          <span>{services.also.text}</span>
        </p>
        {/* F4: styling, rydd opp og loekka er midlertidige (pending "image") til de ekte eksemplene er laget. */}
        {pending && (
          <p className="m-0 -ml-2">
            <PendingMark label={site.pendingLabels.image} />
          </p>
        )}
      </div>
    </section>
  );
}
