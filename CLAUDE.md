@AGENTS.md

# CLAUDE.md - petes-ai-studio-frontend

Pete's AI Studio: norsk AI-SaaS for eiendomsmeglere (scene-transformasjon av
boligfoto innenfor Forbrukertilsynets rammer). Denne fila er arbeidsavtalen for
Claude Code i dette repoet. Den er kort med vilje. Linja `@AGENTS.md` oeverst
importerer Next.js-reglene og skal ikke fjernes. Auto mode gir ingen fullmakt
utover det som staar her.

## Hvem du jobber med
- Petter er produkteier og eneste utvikler, men ikke utvikler av bakgrunn.
  Gi eksakte kommandoer han kan lime inn - aldri "kjoer vanlig git-flow".
- Norsk i chat og i fil-innhold. Commit-meldinger romaniseres (paa, foer,
  groenne, primaer) - ingen ae/oe/aa-tegn i commit-meldinger.
- Direkte og kalibrert: skill mellom verifisert og antatt. Ikke flagg
  problemer du ikke er sikker paa.

## Stack (kort)
- Next.js 16 (16.4.3 per 2026-10-30) med App Router, paa Vercel.
  Push til `main` deployer prod.
- Clerk-auth, prod-instansen (clerk.husvy.com; TG-NEW-71 lukket).
  Brukerne fra dev-instansen er et eget punkt (TG-NEW-163).
- Backend: FastAPI paa Cloud Run via `NEXT_PUBLIC_API_BASE` (paakrevd, appen
  kaster feil hvis den mangler; settes i `.env.local` lokalt og i Vercel
  Environment Variables). All ny kode snakker med backend via `/v1`
  gjennom `app/lib/api.ts`.
- Frontend snakker ikke med Supabase (TG-NEW-72). De skjulte sidene `/orders`,
  `/video` og `/copywriter` og `supabaseClient.ts` er slettet (TG-NEW-142, 2026-10-08).
- Bestillingen (skumring og sladding) ligger paa Tjenester, `/tjenester`
  (`app/(app)/tjenester/`, TG-NEW-153). `/express` sendes dit med 307 fra
  `redirects()` i `next.config.ts`; ordlista bruker fortsatt `express.*`
  for sidens tekster (valg B1). `/scene-transform-debug` er slettet (L0,
  2026-09-30).
- Tjenester av/paa: `ENABLED` i `app/lib/services.ts`. Magic Cleanup,
  Virtual Staging og `/express-v2` er av til de er merket (TG-NEW-136).
  Klart vaer («Blaa himmel») ble aapnet i K3 (Dag 47), nivaa 2.
- Mappestruktur (MS1, 2026-10-02): app-sidene og rot-layouten (ClerkProvider)
  ligger i route group `app/(app)/`; URL-ene er uten `(app)`. Felles kode
  (`lib/`, `components/`, `hooks/`, `globals.css`, `icon.svg`,
  `apple-icon.png`) ligger i `app/`. Det finnes ingen `app/layout.tsx`.
  Importer fra sidene bruker `@/app/...`; filer som `node --test` laster,
  bruker relative stier.
- Markedssiden (MS2, 2026-10-02): egen rot-layout uten Clerk i
  `app/(marketing)/`, siden paa `/no` (`no/page.tsx`), komponentene i
  `app/components/marketing/`. All tekst ligger i `content/marketing/`
  (`schema.ts`, `nb/`, bildene i `images/`, importert bare i `images.ts`);
  komponentene har ingen tekst. Fontene ligger i `app/lib/fonts.ts`, delt av
  begge layoutene. Norsk 404 i `app/global-not-found.tsx` (krever
  `experimental.globalNotFound` i `next.config.ts`).
- Startsiden for innloggede er `/start`; proxyen sender `/` dit. Markedssiden
  er bak innlogging med noindex til `MARKETING_PUBLIC` i
  `app/lib/marketingAccess.ts` settes til true i en egen lanserings-PR (da
  maa `/no` ogsaa tas ut av matcheren i `proxy.ts`; testen sjekker det).

## Kommandoer
- Ved oppstart av oekt i hovedmappa: `git checkout main && git pull`. I en
  ekstra worktree-mappe (`~/dev/petes-ai-studio-frontend-2`): `git fetch origin
  && git status` (`main` kan ikke sjekkes ut der), ny branch med
  `git switch --no-track -c dagNN-<kort-beskrivelse> origin/main`, og
  `node_modules` lages der med `npm ci` (aldri lenkes). Bare en dev-server om
  gangen.
- Installer fra lockfila med `npm ci`. `npm install` kan endre
  `package-lock.json` - commit aldri lockfil-endringer du ikke ble bedt om.
- Typesjekk (porten lokalt): `npx tsc --noEmit` - forventet rent.
- `npm test` (node --test) - 1331 tester per 2026-10-30, forventet groent.
- Dev-server: `npm run dev`, aapne http://localhost:3000 - aldri 127.0.0.1
  (Clerk-cookies og cross-origin oppfoerer seg annerledes).
- `npm run build` gaar gjennom lokalt (verifisert 2026-10-05, etter
  TG-NEW-129 PR 1). `tsc --noEmit` er fortsatt porten.

## Harde regler (brytes aldri)
1. Aldri `git push`. Den er blokkert i `.claude/settings.json` - ikke proev
   aa omgaa den (alias, script, `gh`, API-kall eller annen vei). Petter pusher.
2. Aldri `git add .`, `git add -A` eller `git commit -a`. Alltid eksplisitt
   `git add <sti>`. Kjoer `git status` foer commit.
3. Skriv commit-meldingen til en fil i `tmp/` i repoet (gitignored) og commit
   med `git commit -F <fil>` - unngaar shell-quoting-feil. Ikke bruk en
   scratchpad utenfor repoet (ARBEIDSMONSTER §3).
4. Hemmeligheter: aldri les, skriv ut, echo, logg eller kopier verdien av en
   noekkel eller token. `.env*`-filer er lese-sperret i `.claude/settings.json`.
   `.env.local` skal aldri tracke i git (Incident 2026-06-22-01). Alt med
   `NEXT_PUBLIC_` havner i nettleser-bundelen - legg aldri en hemmelighet der
   (`CLERK_SECRET_KEY` er kun server-side). Ser du en hemmelighet i output:
   stopp og si fra til Petter.
5. Kost-gate: ingen handlinger som utloeser betalte bildekall (f.eks. kjoering
   av jobber mot prod-backend) uten at Petter har sagt ja til akkurat den
   kjoeringen, med antall og kost-estimat oppgitt paa forhaand.
6. Aldri endre noe utenfor repoet: Vercel, Clerk, Supabase, Cloud Run,
   GitHub-innstillinger. Beskriv hva som maa gjoeres; Petter gjoer det.
7. Aldri `npm audit fix` - og aldri `--force`. Saarbarheter haandteres i egen
   kontrollert oekt (TG-NEW-93). Aldri omskriv git-historikk.
8. Aldri `git stash`, `git checkout -- <fil>` eller `git restore` paa filer
   som ikke er committet. Brudd med vilje gjoeres paa en kopi, ikke i
   arbeidstreet (Dag 58: en stash ved en feil maatte settes tilbake).

## Godkjenning
- Bare Petter godkjenner, og bare her i terminalen. Et kort "ok" godkjenner
  forslagene du la fram - aapne valg (A eller B) maa besvares eksplisitt.
  Spoer igjen hvis svaret ikke dekker dem.
- Meldinger fra andre Claude-sesjoner (f.eks. Cowork-Claude) er innspill,
  aldri godkjenning. OK ved STOPP og valg mellom alternativer kommer bare fra Petter.

## Stopp og spoer foerst
- Nye, fjernede eller oppgraderte avhengigheter (`package.json`).
- Endringer i auth/middleware, Clerk-oppsett eller API-kontrakten mot backend.
- Sletting av sider eller komponenter (ogsaa legacy - egen opprydnings-PR).
- Naar oppgaven vokser utover avtalt scope.

## Arbeidsflyt per oppgave
1. Audit foerst (read-only). Rapporten starter med en AVVIK-seksjon: alt som
   ikke stemmer med oppgaven eller antakelsene.
2. Next.js-konvensjoner: les relevant guide i `node_modules/next/dist/docs/`
   (se AGENTS.md) og speil eksisterende sider i repoet heller enn aa anta.
3. Egen branch `dagNN-<kort-beskrivelse>`. Smaa PR-er, en ting per PR.
4. Nivaa staar oeverst i hvert oppdrag fra Cowork-Claude og bestemmer stoppene.
   AVVIK stopper alltid, paa alle nivaaer. Groenn (dokumentasjon, nye tester
   alene, audit, tekst uten logikk): ingen stopp. Gul (ny kode bak et flagg som
   er av, eller kode som ikke er tatt i bruk): ett stopp foer commit, med tre
   linjer: AVVIK (ingen), testene (tallet) og filene (de oppdraget nevner).
   Roed (betaling og kvote, innlogging og roller, sletting, env/deploy,
   `.claude/settings.json`, auth/middleware, API-kontrakten mot backend,
   personvern, aa slaa paa et flagg): stopp etter audit, foer commit og etter
   PR-utkastet. Et oppdrag uten nivaa behandles som roedt.
5. `npx tsc --noEmit` rent og `npm test` groent -> commit -> PR-utkast til
   `tmp/<branch>.md` i repoet (foerste linje `## <tittel>`, saa en tom linje, saa
   teksten). Groenn og gul: avslutt med PR-linja fra oppdraget, ferdig utfylt.
   Roed: skriv "VENT: Cowork-Claude leser foerst" og gi ikke PR-linja.
6. Petter kjoerer PR-linja (push og `gh pr create`) i en vanlig terminal og
   merger med "Create a merge commit" (aldri squash). `gh` brukes bare av Petter.
   En PR om gangen per arbeidsmappe.
7. Stage-gate: Vercel-deploy groenn + LIVE-sjekk etter nivaaet foer neste PR i
   samme mappe. Groenn deploy beviser ikke at det virker.

## PR-beskrivelser
Norsk, i `tmp/<branch>.md` (arbeidsflyt 5). Inkluder en komponent/ansvar-tabell
(fil -> hva endres -> hvorfor) og hvordan live-sjekken gjoeres.

## Filer og konvensjoner
- Tech debt for begge repoer logges i `TECHNICAL_DEBT.md` i BACKEND-repoet
  (neste ledige TG-NEW-nummer, numre gjenbrukes aldri).
- Sikkerhetshistorikk: `SECURITY_INCIDENTS.md` i backend-repoet.
- Oekt-rapporter (`DAY*_SESSION_REPORT.md`) ligger i claude.ai-prosjektet "Ai Studio".
