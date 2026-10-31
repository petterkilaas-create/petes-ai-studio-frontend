# petes-ai-studio-frontend

Frontend for Husvy, et norsk AI-studio for eiendomsmeglere: kveldsbilder, årstider, digital styling, blå himmel og
Skjul ansikter på boligfoto, med synlig AI-merke og tekst til annonsen. Next.js 16 (App Router) på Vercel, innlogging
med Clerk. Backend er et FastAPI-API på Cloud Run; frontend snakker bare med det, via `/v1`.

Reglene for Claude Code i dette repoet står i [`CLAUDE.md`](CLAUDE.md). API-et og backend er beskrevet i
[ARCHITECTURE.md i backend-repoet](https://github.com/petterkilaas-create/petes-ai-studio-backend/blob/main/ARCHITECTURE.md).

## Kommandoer

```bash
npm ci              # installer fra package-lock.json (ikke npm install)
npm run dev         # dev-server på http://localhost:3000 (ikke 127.0.0.1: Clerk-cookies)
npm test            # alle testene (node --test)
npx tsc --noEmit    # typesjekk, skal være ren
npm run lint        # eslint; noen kjente feil står (TG-NEW-279)
npm run build       # produksjonsbygg
```

Kjør bare én dev-server om gangen.

## Mapper

| Mappe | Hva |
|---|---|
| `app/(app)/` | Appen for innloggede, med rot-layouten som har ClerkProvider. `(app)` er ikke en del av adressen. |
| `app/(marketing)/` | Markedssiden og hjelpesidene under `/no`, med egen rot-layout uten Clerk. |
| `app/components/` | Komponentene. `marketing/` for markedssiden, `ordre/` for ordren, `godkjenning/` for godkjenningssiden. |
| `app/lib/` | Ren logikk uten React: API-klienten (`api.ts`), ordlista (`i18n/`), tjenestene (`services.ts`) m.m. |
| `content/marketing/` | All tekst på markedssiden og hjelpesidene (`nb/`), typene (`schema.ts`) og bildene (`images/`). Komponentene har ingen tekst selv. |

Det finnes ingen `app/layout.tsx`: hver route group har sin egen rot-layout. `proxy.ts` (i rota) krever innlogging for
appen og sender `/` til `/start`.

## Rutene

| Adresse | Side |
|---|---|
| `/start` | Startsiden for innloggede. `/` sendes hit. |
| `/tjenester` | Bestilling av enkeltbilder, alle tjenestene. `/express` sendes hit (307). |
| `/ordrer` | Ordrene, én per boligoppdrag, med «Last ned» per ordre. |
| `/ordrer/ny` | Ny ordre: adresse og oppdragsnummer. |
| `/ordrer/[id]/bilder` | Bildesiden: opplasting, rom, rekkefølge og resultatene under hvert bilde. |
| `/ordrer/[id]/tjenester` | Bildebrettet: kryss av bilder og legg til tjenester. |
| `/ordrer/[id]/kontroll` | Oppsummering av bestillingen og start. |
| `/ordrer/[id]/last-ned` | Fillista og ZIP-en med originalene og de godkjente resultatene. |
| `/godkjenning/[jobId]` | Godkjenningssiden: sammenlign, godkjenn, rett eller avvis ett resultat. |
| `/history` | Historikk over jobbene. |
| `/staging` | Virtual staging (av). |
| `/express-v2` | Forsøkside (av). |
| `/no` | Markedssiden (bak innlogging og noindex til lansering, se `app/lib/marketingAccess.ts`). |
| `/no/sporsmal-og-svar` | Spørsmål og svar. «Hjelp» i appen går hit. |
| `/no/veiledning` | Slik bruker du Husvy: veiledningen for meglere. |
| `/no/merking` | Slik merker vi bildene. |
| `/no/kontakt` | Kontakt. |

## Tjenester av og på

`ENABLED` i `app/lib/services.ts` slår tjenester og sider av og på med én linje hver: `skumring`, `digital_styling`,
`aarstider`, `klart_vaer`, `privacy_blur`, `ordrer` (på) og `magic_cleanup`, `virtual_stage`, `express_v2` (av).
En side som er av, vises ikke i menyen. Backend har sin egen liste, som må åpnes samtidig.

Annonsetekst: `LISTING_TEXT_UI` i `app/lib/services.ts` er `"admin"` (bare `view_all` fra `/me`); rulles tilbake ved å sette `"off"` i en ny PR.

## Ordlista

All tekst i appen står i `app/lib/i18n/index.ts`, på norsk (`nb`) og engelsk (`en`), og hentes med `t(locale, nøkkel)`.
Backend sender bare koder; ordlista oversetter dem. Merkenavnet står aldri i teksten: det kommer fra
`app/lib/brand.ts` og fylles inn som `{brand}`.

## Testene

Testene ligger ved siden av koden som `*.test.ts` og kjøres med `node --test` (ingen testrammeverk). Filer som testene
laster, importerer hverandre med relative stier og `.ts` til slutt. `node --test` kan ikke laste `.tsx`, så sidene og
komponentene sjekkes som kildetekst: testen leser fila og ser etter mønstre med regulære uttrykk, og
`app/lib/testing/jsxText.ts` finner tekst skrevet rett inn i JSX (den skal stå i ordlista eller i `content/`).

## Miljøvariabler

Bare navnene; verdiene ligger i `.env.local` lokalt og i Vercel (Environment Variables).

| Navn | Hva |
|---|---|
| `NEXT_PUBLIC_API_BASE` | Adressen til backend. Påkrevd: appen kaster feil uten den. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk, offentlig nøkkel. |
| `CLERK_SECRET_KEY` | Clerk, hemmelig. Bare på serveren. |

Alt med `NEXT_PUBLIC_` havner i nettleseren. `.env.local` skal aldri inn i git.

## Deploy

Vercel bygger og deployer prod når en PR merges til `main`. En grønn deploy betyr ikke at alt virker: sjekk siden etterpå.

## To arbeidsmapper

Repoet brukes fra to mapper: `~/dev/petes-ai-studio-frontend` (hovedmappa, med `main`) og
`~/dev/petes-ai-studio-frontend-2` (en git worktree, der `main` ikke kan sjekkes ut). Hver mappe har sin egen
`node_modules` (`npm ci`) og én PR om gangen.
