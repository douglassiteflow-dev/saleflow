# Demo-konfigurering — Design Spec

## Översikt

När en säljare bokar ett möte i dialern och klistrar in en länk (bokadirekt eller vanlig hemsida), startar systemet automatiskt en AI-driven hemsidegenerering. Ingen manuell konfigurering — AI:n bestämmer allt: stockbilder, färger, layout, tjänster.

Ersätter den befintliga Deal-pipelinen med ett förenklat 4-stegsflöde kallat **Demo-konfigurering**.

---

## Pipeline-steg (4 steg, scope fas 1)

| # | Stage | Trigger | Beskrivning |
|---|-------|---------|-------------|
| 1 | `meeting_booked` | Automatiskt vid mötesbokning | Demo skapas, kopplad till lead + möte |
| 2 | `generating` | Automatiskt direkt efter steg 1 | Claude CLI läser URL, genererar hemsida |
| 3 | `demo_ready` | Automatiskt när generering klar | Förhandsgranskning tillgänglig |
| 4 | `followup` | Manuellt av säljaren | Efter demo-mötet, anteckningar, nästa steg |

**Regler:**
- Steg kan inte hoppas över
- Steg 2 startar automatiskt — ingen manuell trigger
- Steg 3 sätts automatiskt av systemet när Claude CLI är klar
- Säljaren ser realtidsprogress under steg 2

---

## Genereringsflöde (Claude CLI)

### Input
Säljaren klistrar in en URL vid mötesbokning. URL:en skickas direkt till Claude CLI — ingen separat scraper.

### Claude CLI-körning (4 faser)

```
claude --dangerously-skip-permissions \
  -p "Läs brief.md och generera hemsida" \
  --output-format stream-json
```

**Brief.md innehåller:**
- Kundens URL (bokadirekt eller vanlig hemsida)
- Instruktion att läsa sidan och extrahera: företagsnamn, tjänster, kontaktinfo, bransch
- Regler för generering (se nedan)

**Fas 1 — Strategy:** Claude läser URL:en, extraherar all data, analyserar bransch, bestämmer layout-strategi.

**Fas 2 — Pipeline:** Claude genererar single-file HTML med inline CSS/JS:
- **Stockbilder** (Unsplash) — inga kundbilder används
- **Text-logo i HTML/CSS** — företagsnamnet renderat med passande typsnitt och färg, ingen SVG, ingen kundbild
- **Färgpalett** — AI väljer baserat på bransch och data från sidan
- **Alla tjänster** samlas automatiskt från sidan
- Responsive design (mobil + desktop)

**Fas 3 — Review:** Claude granskar sin HTML — fixar layout, typografi, kontrast.

**Fas 4 — Creative pass:** Claude lägger till unika designdetaljer — animationer, dividers, etc.

### Regler för generering
- ALDRIG använda kundens bilder — enbart Unsplash-stockbilder
- ALDRIG använda kundens logo — generera text-logo i HTML/CSS med passande färg
- Färgpalett bestäms helt av AI baserat på bransch
- Alla tjänster från sidan inkluderas automatiskt
- Om sidan har recensioner/betyg — inkludera i hemsidan
- Single HTML file, all CSS/JS inline

### Output
- En HTML-fil (`site/index.html`) sparad på filsystem
- Progress-logg via SSE till frontend

---

## Datamodell

### DemoConfig (ersätter Deal)

Befintlig `Deal`-resurs i `saleflow/sales/deal.ex` byter namn och förenklas.

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| id | uuid | PK |
| lead_id | uuid | FK → Lead |
| user_id | uuid | FK → User (säljaren) |
| stage | atom | `:meeting_booked`, `:generating`, `:demo_ready`, `:followup`, `:cancelled` |
| source_url | string, nullable | Bokadirekt/hemsida-länk |
| website_path | string, nullable | Sökväg till genererad HTML-fil på filsystem |
| preview_url | string, nullable | URL till förhandsgranskning |
| notes | text, nullable | Säljarens anteckningar |
| error | string, nullable | Felmeddelande om generering misslyckas |
| inserted_at | utc_datetime | |
| updated_at | utc_datetime | |

**Borttagna fält** (från befintlig Deal):
- `website_url` → ersätts av `preview_url`
- `contract_url` — utanför scope
- `domain`, `domain_sponsored` — utanför scope

**Nya fält:**
- `source_url` — länken säljaren klistrade in
- `website_path` — sökväg till genererad HTML-fil
- `error` — felmeddelande vid misslyckad generering

**Relationer:**
- DemoConfig belongs_to Lead
- DemoConfig belongs_to User
- DemoConfig has_many Meetings (via `demo_config_id` på Meeting)

### Meeting (ändring)

| Fält | Ändring |
|------|---------|
| `deal_id` | Byter namn till `demo_config_id` |

---

## Backend

### Ändrade resurser

**DemoConfig** (ny resurs, ersätter Deal):

| Action | Beskrivning |
|--------|-------------|
| `:create` | Skapas med `lead_id`, `user_id`, `source_url` |
| `:start_generation` | Sätter stage till `:generating`, startar Oban-worker |
| `:generation_complete` | Sätter stage till `:demo_ready`, sparar HTML/preview_url |
| `:generation_failed` | Sätter `error`, stage förblir `:generating` |
| `:advance_to_followup` | Sätter stage till `:followup` |
| `:cancel` | Sätter stage till `:cancelled` |

### Ny Oban-worker: DemoGenerationWorker

```elixir
defmodule Saleflow.Workers.DemoGenerationWorker do
  use Oban.Worker, queue: :demo_generation, max_attempts: 2

  @impl true
  def perform(%{args: %{"demo_config_id" => id}}) do
    # 1. Hämta DemoConfig med source_url
    # 2. Generera brief.md med URL + regler
    # 3. Spawna Claude CLI med brief
    # 4. Streama progress via PubSub
    # 5. Vid success: update stage → demo_ready, spara filsökväg
    # 6. Vid error: update error-fält
  end
end
```

**Claude CLI spawnas via `System.cmd/3` eller `Port`:**
- `claude -p <brief> --output-format stream-json --dangerously-skip-permissions`
- Output parsas rad för rad, broadcastas via `Phoenix.PubSub`
- HTML-resultat sparas till filsystem + sökväg i databasen

### Automatisk demo-skapelse vid mötesbokning

I `MeetingController.create/2` (befintlig):

```
1. Skapa möte (befintlig logik)
2. Om params har source_url:
   a. Skapa DemoConfig med lead_id, user_id, source_url
   b. Koppla mötet (demo_config_id)
   c. Enqueua DemoGenerationWorker
3. Om lead redan har aktiv DemoConfig:
   a. Koppla mötet till befintlig DemoConfig
```

### Nya endpoints

| Metod | Route | Syfte |
|-------|-------|-------|
| GET | `/api/demo-configs` | Lista (agent: egna, admin: alla) |
| GET | `/api/demo-configs/:id` | Detalj med lead, möten |
| GET | `/api/demo-configs/:id/logs` | SSE-stream av genereringsprogress |
| GET | `/api/demo-configs/:id/preview` | Servera genererad HTML |
| POST | `/api/demo-configs/:id/advance` | Flytta till nästa steg |
| POST | `/api/demo-configs/:id/retry` | Kör om generering vid fel |

### SSE-endpoint för progress

```
GET /api/demo-configs/:id/logs
Content-Type: text/event-stream

data: {"type": "log", "text": "Läser företagsdata..."}
data: {"type": "log", "text": "Genererar hemsida..."}
data: {"type": "status", "status": "demo_ready"}
```

Implementeras med `Phoenix.PubSub` — DemoGenerationWorker broadcastar, endpoint prenumererar.

---

## Frontend

### Mötesbokning — nytt fält

I befintlig mötesbokning (inline i dialern) läggs ett fält till:

```
[Befintliga fält: titel, datum, tid, anteckningar]
[NYTT: URL-fält — "Klistra in bokadirekt eller hemsida-länk"]
```

Fältet är valfritt — om det fylls i triggas demo-generering automatiskt.

### "Demo"-tab i dialern (ersätter "Deals")

**Tab-namn:** "Deals" → "Demo"

**Listvy (DemoTab):**

| Företag | Möte | Status |
|---------|------|--------|
| Bella Salong AB | 8 apr 10:00 | 🟡 Genererar... |
| Tech Solutions | 9 apr 14:00 | 🟢 Demo klar |
| Klipp & Form | 10 apr 09:30 | 🔵 Möte bokat |

- Filtrerar bort `cancelled`
- Klickbar rad → öppnar DemoDetailTab

**Detaljvy (DemoDetailTab):**

Ersätter tab-innehållet (samma mönster som befintlig DealDetailTab).

**Header:**
```
← Tillbaka | Företagsnamn | Status-badge
```

**Stage: `meeting_booked` (ingen URL)**
- Info: "Ingen länk angiven — demo genereras inte"
- Möjlighet att lägga till URL i efterhand → triggar generering

**Stage: `generating`**
- Kompakt steg-indikator (pill-rad): ✓ Hämta — ● Genererar — ○ Klar — ○ Uppföljning
- Realtidslogg (SSE) — scrollande textarea med genereringsoutput
- Uppskattad tid: "~6–10 min"

**Stage: `demo_ready`**
- Förhandsgranskning — iframe eller länk till genererad hemsida
- Knapp: "Öppna i ny flik"
- Knapp: "Gå till uppföljning →"
- Knapp: "Generera om" (om resultatet inte är bra)

**Stage: `followup`**
- Anteckningsfält
- Möteslista (kopplade möten)
- Lead-info

### Kunder-tab

Befintlig "Customers"-tab förblir — visar demo-configs med framtida slutsteg (`won`). Utanför scope för fas 1.

---

## Borttaget jämfört med befintlig Deal-pipeline

| Borttaget | Anledning |
|-----------|-----------|
| Python-scraper (scrape.py) | Claude CLI läser URL direkt |
| Bildval/wizard-steg | AI väljer stockbilder automatiskt |
| Logo-extraction/palett-API | Text-logo i HTML/CSS |
| needs_website, reviewing, deployed, contract_sent, signed, dns_launch, won | Förenklat till 4 steg |
| Admin webapp pipeline-sida | Säljaren hanterar allt i dialern |
| Flowing AI proxy-endpoints | Claude CLI körs direkt i Saleflow backend |

---

## Avgränsningar (utanför scope)

- Steg 5–6 (avtal, vunnen) — byggs senare
- Deploy till Vercel — demo serveras lokalt via Saleflow
- SignFlow-integration
- DNS-konfiguration
- Admin-webapp pipeline-vy
- Konfigurerbar pipeline
- App store-integration

---

## Kvalitetskrav

- 100% test coverage — backend (ExUnit) och frontend (Vitest + Playwright)
- Inga test-skips
- DRY — ingen duplicerad kod
- Alla sidor matchar dashboardens design (sizing, typsnitt, färger, spacing)
- Svenska (ÅÄÖ) i all UI-text
