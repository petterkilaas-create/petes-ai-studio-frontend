import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { IMAGES } from "../../../content/marketing/images";
import type { ServiceMedia, Services as ServicesContent, Site } from "../../../content/marketing/schema";
import { CONTAINER, FOCUS, H2, LEAD, SECTION_Y } from "./classes";

/**
 * Tjenestene som kort i studioer (F4, designet Main.dc.html linje 104-256).
 * Serverkomponent. All tekst kommer fra innholdet (home.services).
 *
 * Dag 58 (F2, Petter 28.10), som paa Tjenester: bare det som kan bestilles
 * har kort med bestillingslenken til site.cta. De store kortene har bilde og
 * staar tre i én rad fra 1024 px; de smaa har ikke bilde. «Kommer snart»
 * staar under, uten bilde og uten lenke. Lenken peker paa kortets h3
 * (aria-describedby), saa de like lenketekstene kan skilles i en skjermleser.
 *
 * Mediet er 230 px hoeyt, saa plassen er satt foer bildene kommer (CLS). I
 * de delte bildene ligger resultatet under og vises helt, og originalen
 * ligger over og klippes til hoeyre halvdel. Resultatet staar altsaa til
 * venstre, speilvendt fra designet, fordi det ekte AI-merket staar nede til
 * venstre i bildet og maa synes (auditen §3). Begge bildene har samme
 * utsnitt nede til venstre (object-left-bottom), saa halvdelene ligger likt.
 * AI-lappen oeverst til venstre er et tillegg og erstatter ikke merket i
 * bildet. Et eksempel er bare originalen, med «Eksempel» og uten AI-lapp
 * (ingen kort bruker det etter Dag 58; Digital styling har et ekte par).
 */

const SIZES = "(min-width: 1320px) 400px, (min-width: 1024px) 31vw, 100vw";

/** Samme stil som hovedknappen i toppen (Hero.tsx). */
const BIG_BUTTON = `flex h-[54px] items-center gap-2.5 self-start rounded-[12px] bg-primary px-6 text-[16.5px] font-semibold text-on-primary no-underline hover:opacity-90 ${FOCUS}`;

const MEDIA = "relative h-[230px] overflow-hidden";

const TAG =
  "pointer-events-none absolute top-2.5 inline-flex items-center gap-1.5 rounded-pill bg-ink/75 px-2.5 py-1 text-[12px] font-semibold text-surface";

/** AI-sirkelen i etiketten: lys paa den moerke lappen, som i designet (ikke AI_CHIP i classes.ts). */
const AI_DOT =
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-surface text-[12px] font-bold tracking-[-0.02em] text-ink";

const LINK = `self-start rounded-button text-[15px] font-semibold text-ink underline underline-offset-[3px] ${FOCUS}`;

function Media({ media, aiLabel }: { media: ServiceMedia; aiLabel: string }) {
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
  return (
    <div className={`${MEDIA} bg-surface-2`}>
      <Image
        src={IMAGES[media.image.image]}
        alt={media.image.alt}
        fill
        sizes={SIZES}
        className="object-cover object-left-bottom"
      />
      <span className={`${TAG} left-2.5`}>{media.label}</span>
    </div>
  );
}

export function Services({ services, site }: { services: ServicesContent; site: Site }) {
  const large = services.items.filter((s) => s.size === "large");
  const small = services.items.filter((s) => s.size === "small");
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
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {large.map((s) => {
              const titleId = `${services.anchor}-${s.id}`;
              return (
                <article
                  key={s.id}
                  className="flex flex-col overflow-hidden rounded-card border border-line bg-surface"
                >
                  {s.size === "large" && <Media media={s.media} aiLabel={services.aiLabel} />}
                  <div className="flex grow flex-col gap-2 p-5">
                    <p className="m-0 text-[12px] font-medium uppercase tracking-[0.05em] text-neutral-fg">{s.studio}</p>
                    <h3 id={titleId} className="m-0 text-[21px] font-semibold leading-[27px] text-ink">
                      {s.title}
                    </h3>
                    <p className="m-0 grow text-[15.5px] leading-[1.55] text-ink-2">{s.text}</p>
                    <a href={site.cta.href} aria-describedby={titleId} className={LINK}>
                      {s.orderLabel}
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
          {small.length > 0 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {small.map((s) => {
                const titleId = `${services.anchor}-${s.id}`;
                return (
                  <article key={s.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5">
                    <p className="m-0 text-[12px] font-medium uppercase tracking-[0.05em] text-neutral-fg">{s.studio}</p>
                    <h3 id={titleId} className="m-0 text-[19px] font-semibold leading-[25px] text-ink">
                      {s.title}
                    </h3>
                    <p className="m-0 grow text-[15.5px] leading-[1.55] text-ink-2">{s.text}</p>
                    <a href={site.cta.href} aria-describedby={titleId} className={LINK}>
                      {s.orderLabel}
                    </a>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        {services.coming.items.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="m-0 text-[17px] font-semibold text-ink">{services.coming.title}</h3>
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-4">
              {services.coming.items.map((s) => (
                <li key={s.id} className="flex flex-col gap-1.5 rounded-card border border-dashed border-line-strong bg-paper p-5">
                  <p className="m-0 text-[12px] font-medium uppercase tracking-[0.05em] text-neutral-fg">{s.studio}</p>
                  <p className="m-0 text-[16px] font-semibold text-ink-2">{s.title}</p>
                  <p className="m-0 text-[14.5px] leading-[1.5] text-ink-2">{s.text}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
