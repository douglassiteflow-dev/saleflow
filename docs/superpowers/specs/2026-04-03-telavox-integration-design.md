# Saleflow — Telavox Integration — Design Spec

## Syfte

Fullständig integration med Telavox-växeln så att agenter kan ringa, se pågående samtal, lyssna på inspelningar och få realtidsuppdateringar — allt inifrån Saleflow.

## Telavox API — Endpoints som används

| Endpoint | Metod | Syfte |
|----------|-------|-------|
| `/extensions/` | GET | Lista alla agenter + pågående samtal |
| `/extensions/{ext}` | GET | Polla enskild agents status + samtal |
| `/extensions/me` | GET | Verifiera per-agent token |
| `/dial/{number}?autoanswer=false` | GET | Initiera samtal (click-to-call) |
| `/hangup` | POST | Avsluta pågående samtal |
| `/calls?withRecordings=true` | GET | Hämta samtalshistorik + recordingId |
| `/recordings/{id}` | GET | Ladda ner inspelning (MP3) |

### Hybrid auth-modell

| Syfte | Token | Anledning |
|-------|-------|-----------|
| Polling pågående samtal | Gemensam (`TELAVOX_API_TOKEN`) | `/extensions/` returnerar alla agenter i ett anrop |
| Samtalshistorik | Gemensam | `/calls` returnerar historik för token-ägaren, men vi använder webhook primärt |
| Inspelningar | Gemensam | `/recordings/{id}` fungerar med valfri giltig token |
| Click-to-call | Per-agent (`users.telavox_token`) | `/dial` ringer den autentiserade användarens telefon |
| Lägg på | Per-agent | `/hangup` avslutar den autentiserade användarens samtal |

### Verifierat API-svar — `/extensions/`

```json
[
  {"extension":"0101898695","name":"Douglas","email":"douglas@siteflow.se",
   "mobile":"0791501070","extensionE164":"+46101898695","mobileE164":"+46791501070",
   "profile":{"available":true,"name":"Tillgänglig","until":"...","message":null},
   "calls":[],"keyWords":[]},
  {"extension":"0101892391","name":"Milad Farahmand","email":"milad@siteflow.se",
   "mobile":"0791500931","extensionE164":"+46101892391","mobileE164":"+46791500931",
   "profile":{"available":true},"calls":[],"keyWords":[]},
  {"extension":"0101892392","name":"Albin","email":"albin@siteflow.se",
   "mobile":"0791500932","extensionE164":"+46101892392","mobileE164":"+46791500932",
   "profile":{"available":true},"calls":[],"keyWords":[]},
  {"extension":"0101892393","name":"Tomas Yachou","email":"tomas@siteflow.se",
   "mobile":"0791500933","extensionE164":"+46101892393","mobileE164":"+46791500933",
   "profile":{"available":true},"calls":[],"keyWords":[]},
  {"extension":"0989129781","name":"Admin","email":"","mobile":"",
   "profile":{"available":true},"calls":[],"keyWords":[]}
]
```

### Verifierat API-svar — `/calls?withRecordings=true`

Returnerar `{ incoming: [], outgoing: [...], missed: [...] }`. Varje samtal:

```json
{
  "datetime": "2026-04-03 09:00:30",
  "dateTimeISO": "2026-04-03T09:00:30.646+0200",
  "duration": 1,
  "number": "0737573688",
  "numberE164": "+46737573688",
  "recordingId": "10b1b387-dd3c-4911-b083-e5e70008183a",
  "callId": "95c3573b-6d27-41b3-bdae-94b84ddb6110"
}
```

Fält utöver dokumentationen: `callId`, `numberE164`, `extensionE164`, `mobileE164`.

### Verifierat — aktiva samtal i `/extensions/`

`calls`-arrayen per extension innehåller pågående samtal:

```json
{"callerid": "0701231234", "direction": "in", "linestatus": "up"}
```

Fält: `callerid` (motpart), `direction` (`in`/`out`/`unknown`), `linestatus` (`up`/`down`/`ringing`).

---

## 1. Datamodell

### Nytt fält på `users`

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `telavox_token` | string, krypterat, nullable | Per-agent JWT för click-to-call/hangup |

Befintliga fält som redan används för matchning:
- `extension_number` — matchar mot Telavox extension
- `phone_number` — matchar mot Telavox mobile

### Nya fält på `phone_calls`

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `recording_key` | string, nullable | R2-objektnyckel (sökväg till MP3) |
| `recording_id` | string, nullable | Telavox recording ID |
| `telavox_call_id` | string, nullable | Telavox callId (UUID) |
| `direction` | atom (`:incoming`/`:outgoing`/`:missed`) | Samtalsriktning |

---

## 2. Telavox-koppling

### Gemensam token (admin)

1. Admin genererar JWT i Telavox Flow (Settings > My Account)
2. Sätter `TELAVOX_API_TOKEN` som miljövariabel
3. Backend verifierar vid uppstart via `GET /extensions/`

### Per-agent token (för click-to-call)

1. Agent går till sin profil
2. Sektion "Telavox" — textfält för att klistra in sin JWT-token
3. Backend verifierar via `GET /extensions/me` med agentens token
4. Om OK → sparar token krypterat, visar grön status + extension-info
5. Om fel → visar felmeddelande

### Token-utgång

**Gemensam token (401 vid polling):**
- Loggar varning
- Admin-notis i appen: "Telavox-token har gått ut — uppdatera TELAVOX_API_TOKEN"
- Polling/inspelningar stoppas tills token uppdateras

**Per-agent token (401 vid dial/hangup):**
- Rensar `telavox_token` på usern
- In-app notis till agenten: "Din Telavox-koppling har gått ut — uppdatera i din profil"
- Click-to-call disabled för den agenten

### Backend

- `POST /api/telavox/connect` — body: `{ token }`
  - Anropar `/extensions/me` med angiven token
  - Om OK → sparar token krypterat på user
  - Returnerar `{ ok: true, extension: "0101892392", name: "Albin" }`
- `POST /api/telavox/disconnect`
  - Rensar token
- Nytt modul: `Saleflow.Telavox.Client`
  - `request(method, path, opts)` — gemensam token som default
  - `request_as(user, method, path, opts)` — per-agent token för dial/hangup
  - Vid 401 → triggar rätt disconnect-flow

### Frontend (profil)

- Sektion "Telavox"
  - Ej kopplad: textfält + "Anslut"-knapp
  - Kopplad: extension + namn + grön ikon + "Koppla från"-knapp
  - Utgången: gul varning + "Uppdatera token"-knapp

---

## 3. Click-to-call

### Backend

- `POST /api/calls/dial` — body: `{ lead_id }`
  - Hämtar leadens telefonnummer (`telefon`)
  - Hämtar agentens `telavox_token`
  - Anropar Telavox `GET /dial/{number}?autoanswer=false` med agentens Bearer-token
  - Agentens telefon ringer → agent svarar → leadens nummer rings upp
  - Returnerar `{ ok: true }`
- `POST /api/calls/hangup`
  - Anropar Telavox `POST /hangup` med agentens token
  - Returnerar `{ ok: true }`

### Frontend

- Lead-kortet: "Ring"-knapp (telefon-ikon, grön, `--color-success`)
- Under pågående samtal: byter till "Lägg på"-knapp (röd, `--color-danger`)
- Disabled om: agent saknar `telavox_token`, eller lead saknar telefonnummer

### Felhantering

- Agent saknar token → toast: "Koppla Telavox i din profil för att ringa"
- 401 → triggar token-expired-flödet för agenten
- Telavox returnerar fel → toast med felmeddelande

---

## 4. Realtid — pågående samtal

### Backend

- Oban-jobb `Saleflow.Workers.TelavoxPollWorker`
  - Cron: var 5:e sekund
  - Bara under arbetstid (konfigurerbart, default 07–19)
  - **Ett enda API-anrop:** `GET /extensions/` med gemensam token
  - Returnerar alla extensions med deras `calls`-array
  - Matchar extensions mot `users.extension_number`
  - Jämför med förra pollen → detekterar nya/avslutade samtal
  - Broadcast via Phoenix PubSub till topic `"calls:live"`
  - Lagrar state i ETS/Agent för jämförelse

### Frontend

- Phoenix Channel: `"calls:live"`
- Dashboard: ny sektion "Pågående samtal"
  - Visas bara om det finns aktiva samtal
  - Per samtal: agentnamn, motpart (nummer + leadnamn om matchat), riktning, live-timer
  - "Medlyssna"-knapp → öppnar Telavox Flow i ny flik
- Designtokens:
  - Card med `rounded-lg`, `var(--color-border)`, `var(--spacing-card)` padding
  - Agentnamn: `--color-text-primary`, 14px, 500wt
  - Nummer/lead: `--color-text-secondary`, 14px
  - Timer: `--font-mono`, `--color-accent`
  - Medlyssna-knapp: secondary variant

---

## 5. Realtid — KPI-uppdateringar

### Backend

- Befintlig webhook `POST /api/webhooks/telavox/hangup` utökas:
  - Efter PhoneCall skapats → broadcast via PubSub till `"dashboard:updates"`
  - Payload: uppdaterade stats (calls_today, conversion, leaderboard)

### Frontend

- Phoenix Channel: `"dashboard:updates"`
- StatCards, konvertering och leaderboard uppdateras live vid varje hangup-event
- Ingen manuell refresh behövs

---

## 6. Inspelningar

### Backend

- Oban-jobb `Saleflow.Workers.RecordingFetchWorker`
  - Triggas efter hangup-webhook med 30 sekunders delay (Telavox processar MP3)
  - Anropar `GET /calls?withRecordings=true` med gemensam token
  - Matchar samtalet via tidpunkt + nummer → hämtar `recordingId`
  - Laddar ner MP3 via `GET /recordings/{recordingId}`
  - Sparar till Cloudflare R2: `recordings/{year}/{month}/{phone_call_id}.mp3`
  - Uppdaterar PhoneCall med `recording_key` + `recording_id`
  - Om inspelning ej redo → retry efter 30s (max 3 retries)

### Cloudflare R2

- S3-kompatibelt API via `ex_aws` + `ex_aws_s3`
- Bucket: `saleflow-recordings`
- Config: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`
- Nytt modul: `Saleflow.Storage` — upload, signerad URL (1h giltighet)

### Backend endpoint

- `GET /api/calls/:phone_call_id/recording`
  - Genererar signerad R2-URL
  - Returnerar `{ url: "https://..." }`

### Frontend

- Lead-sidan: samtalshistorik med inspelningsikon per samtal (om inspelning finns)
- Klick → inline HTML5 `<audio>`-spelare
- Designtokens:
  - Inspelningsikon: `--color-accent` (indigo)
  - Audiospelare: minimal styling, rounded-[6px], `--color-bg-panel` bakgrund

---

## 7. UI-design

Alla nya komponenter följer Clean & Minimal designsystemet:

### Tokens som används

- **Bakgrund:** `--color-bg-primary` (white), `--color-bg-panel` (#F8FAFC)
- **Text:** `--color-text-primary` (#0F172A), `--color-text-secondary` (#64748B)
- **Accent:** `--color-accent` (#4F46E5), `--color-accent-hover` (#4338CA)
- **Status:** `--color-success` (#059669), `--color-warning` (#F59E0B), `--color-danger` (#DC2626)
- **Borders:** `--color-border` (#E2E8F0)
- **Spacing:** `--spacing-card` (20px), `--spacing-element` (12px), `--spacing-page` (24px)
- **Radier:** card 8px, button/input 6px
- **Font:** Inter, 14px body, 12px labels (uppercase, 500wt, 0.05em tracking)

### Komponentmönster

- Knappar: använd befintlig `Button`-komponent (primary/secondary/danger)
- Inputs: använd befintlig `Input`-komponent
- Cards: använd befintlig `Card`-komponent
- Modaler: vit bakgrund, rounded-lg, subtle shadow, overlay
- Toasts: minimal, rounded-[6px], accent/success/danger beroende på typ
- Inga extra ramar, skuggor eller dekorationer utöver vad designsystemet definierar

---

## 8. Nya moduler (backend)

| Modul | Ansvar |
|-------|--------|
| `Saleflow.Telavox.Client` | HTTP-klient mot Telavox API, gemensam + per-agent auth, 401-hantering |
| `Saleflow.Storage` | Cloudflare R2 upload/download/signerade URLs |
| `Saleflow.Workers.TelavoxPollWorker` | Pollar `/extensions/` var 5:e sekund med gemensam token |
| `Saleflow.Workers.RecordingFetchWorker` | Hämtar inspelningar efter samtal med gemensam token |

## 9. Nya frontend-komponenter

| Komponent | Plats | Beskrivning |
|-----------|-------|-------------|
| `TelavoxConnect` | profil | Token-inmatning + status |
| `DialButton` | lead-kort | Ring/lägg på-knapp |
| `LiveCalls` | dashboard | Pågående samtal-sektion |
| `RecordingPlayer` | lead-sida | Inline audiospelare |
| `TelavoxWarning` | admin-dashboard/sidebar | Varning vid utgången token |

## 10. Konfiguration

### Miljövariabler (nya)

| Variabel | Beskrivning |
|----------|-------------|
| `TELAVOX_API_TOKEN` | Gemensam JWT Bearer-token (polling, inspelningar, historik) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY` | R2 access key |
| `R2_SECRET_KEY` | R2 secret key |
| `R2_BUCKET` | R2 bucket name (`saleflow-recordings`) |

### Befintliga (oförändrade)

| Variabel | Beskrivning |
|----------|-------------|
| `TELAVOX_WEBHOOK_SECRET` | Webhook-autentisering (redan implementerat) |
