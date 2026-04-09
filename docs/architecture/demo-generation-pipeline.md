# Demo Generation Pipeline

Komplett dokumentation av hur demo-hemsidor genereras, deployas och serveras till kunder.

## Översikt

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEMO GENERATION FLOW                        │
└─────────────────────────────────────────────────────────────────┘

1. Agent bokar möte    2. Backend skapar     3. Genflow pollar
   (dialer)               GenerationJob         (Douglas's Mac)
       │                       │                      │
       ▼                       ▼                      ▼
┌──────────────┐      ┌────────────────┐     ┌──────────────────┐
│   Saleflow   │─────>│ PostgreSQL     │<────│ Genflow Server   │
│   Backend    │      │  (Neon)        │     │  (Electron app)  │
│  (Fly.io)    │      │                │     │                  │
└──────────────┘      │ • deals        │     └────────┬─────────┘
       │              │ • demo_configs │              │
       │              │ • generation_  │              │ 4. Kör Flowing AI
       │              │    jobs        │              ▼
       │              └────────────────┘     ┌──────────────────┐
       │                                     │  Flowing AI      │
       │                                     │  localhost:1337  │
       │                                     │  - scrape        │
       │                                     │  - generate      │
       │                                     │  - deploy        │
       │                                     └────────┬─────────┘
       │                                              │
       │                                              ▼
       │                                     ┌──────────────────┐
       │   6. Kund besöker                   │  Vercel          │
       │      demo.siteflow.se/slug          │  (per-demo       │
       ▼                                     │   project)       │
┌──────────────────┐                         └─────────┬────────┘
│  demo-router     │   5. Proxy till Vercel            │
│  (Next.js app    │◀──────────────────────────────────┘
│   på Vercel)     │
│                  │
│  demo.siteflow.se│
└──────────────────┘
       │
       │ Lookup slug → URL
       ▼
┌──────────────────┐
│ GET /api/d/:slug │
│ på Saleflow      │
└──────────────────┘
```

## Komponenter

### 1. Saleflow Backend (Fly.io)

**Host:** `sale.siteflow.se`
**Databas:** Neon PostgreSQL (direkt-endpoint, ej pooler)

**Relevanta resurser:**

- `deals` — stages: `booking_wizard → demo_scheduled → meeting_completed → questionnaire_sent → contract_sent → won`
- `demo_configs` — stages: `meeting_booked → generating → demo_ready → followup`
- `generation_jobs` — stages: `pending → processing → completed / failed`

**Relevant kod:**

- `backend/lib/saleflow_web/controllers/lead_controller.ex` — Outcome endpoint. Vid `meeting_booked` outcome med `source_url`:
  1. Skapar Meeting
  2. Skapar/återanvänder Deal
  3. Skapar DemoConfig med source_url
  4. Köar `DemoGenerationWorker`
- `backend/lib/saleflow/workers/demo_generation_worker.ex` — Skapar GenerationJob när `USE_GENFLOW_JOBS=true` (default i prod)
- `backend/lib/saleflow_web/controllers/gen_job_controller.ex` — API för genflow-appen att hämta/uppdatera jobb
- `backend/lib/saleflow_web/controllers/demo_lookup_controller.ex` — Public lookup: `GET /api/d/:slug` returnerar `{slug, url}`

### 2. Genflow Server (Electron-app, Douglas's Mac)

**Plats:** `apps/genflow-local-server/`
**Binary:** `~/Desktop/Genflow Server.app`
**Tech:** Electron + React + TypeScript

**Konfiguration** (`~/.genflow/config.json`):

```json
{
  "backendUrl": "https://sale.siteflow.se",
  "apiKey": "gf_siteflow_prod_2026",
  "flowingAiUrl": "http://localhost:1337",
  "pollInterval": 5000
}
```

**Arbetsflöde:**

1. Pollar `GET /api/gen-jobs/pending` var 5:e sekund (med `X-GenFlow-Key` header)
2. När jobb finns: markerar som `processing` via `POST /:id/pick`
3. Kör Flowing AI lokalt:
   - `POST http://localhost:1337/api/scrape` — returnerar `{slug, data}` där `slug` är Flowing AI:s eget slug (inte vårt)
   - `POST http://localhost:1337/api/generate` med slug från scrape-responsen — returnerar `{status: "generating"}` (asynkront)
   - Pollar `GET /api/generate/:slug/status` var 5:e sekund tills `status === "done"` (max 15 min)
   - `POST http://localhost:1337/api/deploy/:slug` — returnerar `{url}` (Vercel deployment URL)
4. Rapporterar resultat via `POST /:id/complete` med `result_url`

**Slug-logik (VIKTIGT):**

- Vår backend skickar en slug baserad på hostname (t.ex. `bokadirekt-se`)
- Flowing AI genererar ett eget slug från scrape-resultatet (t.ex. `sakura-relax-massage-59498`)
- **Genflow-appen använder alltid Flowing AI:s slug** för generate + deploy — annars 404

### 3. Flowing AI (lokalt på Douglas's Mac)

**Host:** `http://localhost:1337`
**Plats:** `apps/offert_generator/genflow-4.10.2/`

**Endpoints:**

- `POST /api/scrape` — `{url}` → `{slug, data: {namn, services, images, ...}}`
- `POST /api/generate` — `{slug, selectedImages, selectedServices}` → `{status: "generating", slug}` (async)
- `GET /api/generate/:slug/status` — `{status: "generating" | "done" | "error", error}`
- `POST /api/deploy/:slug` — `{}` → `{url: "https://sakura-...-siteflow-dev.vercel.app"}`

**Viktigt om Flowing AI:**

- Generate är **asynkron**. Man MÅSTE polla status innan deploy, annars returnerar deploy `"No site to deploy"` (404).
- Generate tar ~5-10 minuter per hemsida.
- Deployar till Vercel-team `siteflow-dev`. Varje demo blir **ett eget Vercel-projekt**.

### 4. Demo Router (`demo.siteflow.se`)

**Plats:** `apps/demo-router/`
**Tech:** Next.js 15 + App Router + Middleware
**Deploy:** Vercel-projekt (separat)
**Domain:** `demo.siteflow.se`

**Hur det fungerar:**

1. Användare besöker `demo.siteflow.se/sakura-relax-massage-59498`
2. `middleware.ts` fångar requesten
3. Extraherar slug (`sakura-relax-massage-59498`) från path
4. Anropar `GET https://sale.siteflow.se/api/d/sakura-relax-massage-59498`
5. Saleflow söker i `generation_jobs` (status `completed`) eller `demo_configs` (stage `demo_ready`/`followup`)
6. Returnerar `{url: "https://sakura-...-siteflow-dev.vercel.app"}`
7. Middleware `NextResponse.rewrite()` till den URL:en
8. **URL i webbläsaren stannar på `demo.siteflow.se/sakura-relax-massage-59498`** (proxy, inte redirect)
9. Edge-cacheas i 5 minuter (`revalidate: 300`)

**Miljövariabler:**

- `SALEFLOW_API_URL` — default `https://sale.siteflow.se`

## Deployment & Setup

### Saleflow Backend

```bash
cd /Users/douglassiteflow/dev/saleflow
fly deploy
```

**Secrets som måste vara satta i Fly:**

- `DATABASE_URL` — Neon **direkt-endpoint** (INTE pooler, annars ser maskinen inte schemaändringar)
- `GENFLOW_API_KEY` — samma som Genflow-appen använder
- `USE_GENFLOW_JOBS=true` — aktiverar genflow-läge

### Genflow Server (Desktop)

```bash
cd /Users/douglassiteflow/dev/saleflow/apps/genflow-local-server
npm install
npm run pack
cp -r "dist/mac-arm64/Genflow Server.app" ~/Desktop/
```

### Demo Router (Vercel)

```bash
cd /Users/douglassiteflow/dev/saleflow/apps/demo-router
vercel deploy --prod
```

**DNS (Strato):**

```
Type:  CNAME
Name:  demo
Value: cname.vercel-dns.com
TTL:   3600
```

**Vercel:**

1. Importera `demo-router` som nytt projekt
2. Settings → Domains → Add `demo.siteflow.se`
3. Verifiera domänen

### Flowing AI

Måste köra lokalt på Douglas's Mac:

```bash
cd apps/offert_generator/genflow-4.10.2
node bin/genflow.js
```

## Vanliga problem

### "undefined_column: meeting_outcome"

Neon har separata schema-endpoints (pooler vs direkt). Om `DATABASE_URL` pekar på pooler kan Fly-maskinen se gamla schema.

**Fix:** Sätt `DATABASE_URL` till direkt-endpoint (ta bort `-pooler` från hostnamnet).

### "Generering misslyckades (404): No site to deploy"

Flowing AI generate är asynkron. Genflow-appen måste polla status innan deploy.

**Fix:** Redan implementerad i `apps/genflow-local-server/src/worker.ts` — pollar `/api/generate/:slug/status` tills `done`.

### "Failed to process outcome"

Betyder `lead_controller.apply_outcome` kraschade. Kolla `fly logs -a saleflow-app`.

**Vanliga orsaker:**

- Saknad DB-kolumn (se ovan)
- Redan existerande möte samma tid (dubbelbokning, korrekt beteende)

### Genereringen tar jättelång tid

Normalt 5-10 min per hemsida. Timeout är 15 min. Om den tar längre är det troligen Claude CLI eller Vercel som är långsam.

## Relaterade dokument

- `docs/superpowers/specs/2026-04-08-sales-pipeline-v2-design.md` — Pipeline v2 design
- `docs/superpowers/specs/2026-04-08-genflow-local-server-design.md` — Genflow app design
- `apps/genflow-local-server/README.md` — Genflow app manual
