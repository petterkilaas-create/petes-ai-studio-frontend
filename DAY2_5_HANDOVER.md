# Day 2.5 — Frontend handover, 26. april 2026

**Branch state:** main (merget fra day2-frontend-realtime — verifiser status)
**Status:** `/express-v2` minimal POC fungerer mot ny backend

---

## TL;DR

Frontend hadde aldri snakket med ny `/v1/process`-backend siden 22. april.
Den ringte døde `/start-job/`-endepunkter. I kveld bygde vi en parallell
`/express-v2`-side som beviser at frontend kan snakke med ny backend.

PRIVACY_BLUR fungerer end-to-end. MAGIC_CLEANUP feiler med fal HTTP 405
(backend-bug, ikke frontend).

---

## 1. Hva ble levert

### 1.1 Auth-fix

`proxy.ts → middleware.ts` (Next.js 15 server-side auth fungerte ikke før).
Commit: `79af5de`.

### 1.2 Supabase-konfig

Fjernet hardkodede fallbacks i `lib/supabaseClient.ts`. Krever nå env vars,
fail loud hvis manglende.
Commit: `1f944fb`.

### 1.3 Ny lib-infrastruktur (NY i kveld)

**`app/lib/api.ts`** — typed fetch wrapper:
- `API_BASE` (env var med prod-fallback)
- `submitJob({service, image, paramsJson, getToken})` — POST /v1/process
- `pollJob({jobId, getToken})` — GET /v1/jobs/{id}
- Diskriminerte unioner: `SubmitResult` (sync/async), `JobResult` (pending/done/failed)

**`app/lib/useJobStatus.ts`** — React polling hook:
- 2000ms interval
- Første poll umiddelbart (UX-fix)
- `URL.createObjectURL` på done, `revokeObjectURL` på cleanup
- Cancelled-flag mot stale closures

### 1.4 Ny side: `app/express-v2/page.tsx`

Minimal POC:
- Single file upload
- 3 services: PRIVACY_BLUR, MAGIC_CLEANUP, VIRTUAL_STAGE_SCANDI
- Run + Reset
- Sync: vis blob-URL umiddelbart
- Async: useJobStatus poller til ferdig
- Bruker `useUser()` (UTEN `isLoaded`-sjekk pga middleware allerede gatekeeper)

Eksisterende `app/express/page.tsx` er **uendret** og snakker fortsatt med
døde endepunkter. Skal migreres senere.

---

## 2. Kritisk Clerk-detalj for fremtiden

I `app/express-v2/page.tsx` brukes:

```tsx
const { user } = useUser();  // UTEN isLoaded
```

IKKE bruk `const { isLoaded, user } = useUser()` med `if (!isLoaded) return <Loading/>`-sjekk. Det henger på "Loading..." for evig i denne app-konfigurasjonen.

Eksisterende `/express` bruker også samme mønster (`const { user } = useUser()`). Det er **konvensjonen i denne appen**.

---

## 3. Smoke-test resultater

Testet 22:13 lokal tid mot `localhost:3000/express-v2`:

| Service | Resultat |
|---|---|
| PRIVACY_BLUR | ✅ fungerer (stygge blokker, men arkitektur bevist) |
| MAGIC_CLEANUP | ❌ "fal status HTTP 405" (backend-bug) |
| VIRTUAL_STAGE_SCANDI | ⏳ ikke testet |

---

## 4. Hva gjenstår

### 4.1 Migrere eksisterende `/express`

Når backend støtter alle services Express trenger:
1. Erstatt `/start-job/` POST med `submitJob()` per bilde
2. Erstatt 2-sek Supabase polling på `projects` med `useJobStatus(jobId)`
3. Behold eksisterende UI/UX

### 4.2 Migrere andre sider

- `/staging` — ringer fortsatt døde endepunkter
- `/video` — ringer fortsatt døde endepunkter
- `/copywriter` — ringer fortsatt døde endepunkter
- `/orders` — ringer fortsatt døde endepunkter

Ingen av disse fungerer i prod siden 22. april. Null-skade pga null kunder.

### 4.3 Slett `/express-v2` etter `/express` migrert

Når `/express` er migrert til ny backend, kan `/express-v2` slettes som
midlertidig POC.

---

## 5. Frontend systemtilstand

### Aktive filer

```
app/
├─ lib/
│  ├─ api.ts (NY i kveld)
│  └─ useJobStatus.ts (NY i kveld)
├─ express-v2/page.tsx (NY i kveld, minimal POC)
├─ express/page.tsx (snakker med døde endepunkter, IKKE migrert)
├─ staging/page.tsx (snakker med døde endepunkter)
├─ video/page.tsx (snakker med døde endepunkter)
├─ copywriter/page.tsx (snakker med døde endepunkter)
├─ orders/page.tsx (snakker med døde endepunkter)
└─ middleware.ts (renamed fra proxy.ts i kveld)

lib/
└─ supabaseClient.ts (oppdatert i kveld, fail loud)
```

### Env vars (.env.local, 5 keys)

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- (en til, sannsynligvis API base eller frontend URL)

### Backend-base

Hardkodet i flere filer:
```typescript
const API = "https://petes-ai-studio-backend-v2-32654019163.europe-north1.run.app";
```

`app/lib/api.ts` har env-var-pattern:
```typescript
process.env.NEXT_PUBLIC_API_BASE ?? "https://...run.app"
```

Konsoliderbar senere.

---

## 6. Kjente bugs / quirks

### 6.1 WebSocket HMR feiler i Codespaces (kosmetisk)

Når `npm run dev` kjører i Codespaces, gir browser-Console:
```
WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr' failed
```
Det er Next.js Hot Module Replacement som ikke kobler riktig i forwarded
ports. Stopper IKKE siden fra å laste. Kan ignoreres.

### 6.2 Clerk dev mode warning

```
Clerk has been loaded with development keys
```
Forventet — vi er ikke i prod-Clerk ennå. Til Day 7+.

---

## 7. Restart-prompt for neste sesjon (frontend-spesifikt)

Inkludert i backend-handover seksjon 8.

---

## 8. Lærdommer

- **Test end-to-end ofte.** Express ringte døde endepunkter i 4 dager før noen
  oppdaget det.
- **Filnavnet skifter mellom Next-versjoner.** I Next.js 15 må filen hete
  `middleware.ts` (ikke `proxy.ts`). I Next.js 16 er konvensjonen reversert:
  filen heter `proxy.ts` (omdøpt på Dag 10 da vi oppgraderte). Hvis du jobber
  på en eldre branch eller med en eldre Next-versjon, sjekk hvilken konvensjon
  som gjelder.
- **`useUser()` uten `isLoaded`** er konvensjonen i denne appen.
- **Backend CORS må eksplisitt tillate localhost:3000** for lokal utvikling.
