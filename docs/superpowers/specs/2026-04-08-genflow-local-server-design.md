# genflow-local-server — Design Spec

## Overview

En Electron desktop-app som körs på Douglas's Mac och processar hemsidegenerering åt Saleflow. Appen pollar Saleflow-backenden för nya generation jobs, kör Flowing AI lokalt, och postar tillbaka resultatet. Ingen tunnel behövs — appen initierar all trafik.

---

## Arkitektur

Saleflow Backend skapar `GenerationJob` i databasen när en demo-hemsida behöver genereras. genflow-local-server pollar var 5:e sekund efter pending jobs, plockar upp dem, kör Flowing AI (scrape → generate → deploy), och postar tillbaka result_url.

---

## Backend — Nya resurser och endpoints

### GenerationJob (ny Ash-resurs)

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `deal_id` | uuid FK nullable | Koppling till deal |
| `demo_config_id` | uuid FK nullable | Koppling till demo config |
| `source_url` | string | URL att scrapa/generera från |
| `slug` | string | Slug för generering |
| `status` | enum | `pending`, `processing`, `completed`, `failed` |
| `result_url` | string nullable | Deployad hemsidans URL |
| `error` | text nullable | Felmeddelande |
| `picked_up_at` | utc_datetime nullable | När appen plockade jobbet |
| `completed_at` | utc_datetime nullable | När jobbet slutfördes |

### API-endpoints (autentiserade med API-nyckel)

| Metod | Route | Syfte |
|-------|-------|-------|
| `GET /api/gen-jobs/pending` | Hämta nästa pending job |
| `POST /api/gen-jobs/:id/pick` | Markera som processing |
| `POST /api/gen-jobs/:id/complete` | Posta resultat (result_url) |
| `POST /api/gen-jobs/:id/fail` | Rapportera fel (error) |

Auth: `X-GenFlow-Key` header med API-nyckel konfigurerad i Saleflow.

### DemoGenerationWorker — ändrad

Istället för att köra Claude CLI lokalt:
1. Skapar ett GenerationJob med `source_url` och `slug`
2. Pollar jobbet var 5:e sekund (max 15 min timeout)
3. När `completed`: hämtar `result_url`, sparar på DemoConfig + Deal
4. När `failed`: loggar fel, markerar DemoConfig som error

---

## Electron-app — `apps/genflow-local-server/`

### Tech stack

- Electron (desktop shell)
- React + Vite (UI)
- TypeScript
- Tailwind CSS (matcha Saleflow-design)

### UI

**Huvudfönster:**
- Statusindikator: grön prick "Ansluten" / röd "Frånkopplad"
- Start/Stopp polling-knapp
- Backend-URL inställning (default: `https://api.siteflow.se`)
- API-nyckel inställning
- Jobbkö: lista med pågående/klara/misslyckade jobb
- Logg-panel: scrollbar realtidsloggar
- Statistik: genomförda idag, misslyckade

### Flöde per jobb

1. Poll `GET /api/gen-jobs/pending` → hittar job
2. `POST /api/gen-jobs/:id/pick` → markera som processing
3. Kör lokalt:
   - `POST http://localhost:1337/api/scrape` med source_url
   - `POST http://localhost:1337/api/generate` med slug + scrapad data
   - `POST http://localhost:1337/api/deploy/{slug}` → får result_url
4. `POST /api/gen-jobs/:id/complete` med result_url
5. Vid fel: `POST /api/gen-jobs/:id/fail` med felmeddelande

### Konfiguration

Sparas lokalt i `~/.genflow/config.json`:
```json
{
  "backendUrl": "https://api.siteflow.se",
  "apiKey": "gf_abc123...",
  "flowingAiUrl": "http://localhost:1337",
  "pollInterval": 5000
}
```

---

## Säkerhet

- API-nyckel i `X-GenFlow-Key` header
- Nyckel genereras/hanteras i Saleflow admin (eller .env)
- Appen initierar all trafik — ingen publik port, inget tunnel
- Flowing AI körs bara lokalt på Douglas's Mac

---

## Utanför scope

- Admin-UI för att hantera API-nycklar (hårdkodad i config/env)
- Flera parallella genflow-klienter
- Auto-update av appen
- Windows/Linux-stöd (bara macOS)

---

## Kvalitetskrav

- 100% test coverage
- TypeScript strict mode
- Electron-appen paketeras med electron-builder
- Svenska UI-text
