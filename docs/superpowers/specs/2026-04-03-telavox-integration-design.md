# Saleflow — Telavox Integration — Design Spec

## Syfte

Fullständig integration med Telavox-växeln så att agenter kan ringa, se pågående samtal, lyssna på inspelningar och få realtidsuppdateringar — allt inifrån Saleflow.

## Telavox API — Endpoints som används

| Endpoint | Metod | Syfte |
|----------|-------|-------|
| `/auth/login` | GET | Basic Auth → hämta JWT-token |
| `/extensions/me` | GET | Verifiera koppling, hämta extension-info |
| `/extensions/{ext}` | GET | Polla pågående samtal (calls-fält) |
| `/dial/{number}` | GET | Initiera samtal (click-to-call) |
| `/hangup` | POST | Avsluta pågående samtal |
| `/calls?withRecordings=true` | GET | Hämta samtalshistorik + recordingId |
| `/recordings/{id}` | GET | Ladda ner inspelning (MP3) |

Auth: Bearer JWT per agent. Token hämtas via Basic Auth mot `/auth/login`.

---

## 1. Datamodell

### Nya fält på `users`

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `telavox_username` | string, krypterat | Telavox-användarnamn |
| `telavox_token` | string, krypterat | JWT-token från Telavox |
| `telavox_connected` | boolean, default false | Om integrationen är aktiv |
| `telavox_extension` | string, nullable | Anknytningsnummer från Telavox |

### Nya fält på `phone_calls`

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `recording_key` | string, nullable | R2-objektnyckel (sökväg till MP3) |
| `recording_id` | string, nullable | Telavox recording ID |
| `direction` | atom (`:incoming`/`:outgoing`/`:missed`) | Samtalsriktning |

---

## 2. Telavox-koppling (per agent)

### Kopplingsflow

1. Agent navigerar till sin profil
2. Klickar "Koppla Telavox" → modal öppnas
3. Anger Telavox-användarnamn + lösenord
4. Backend anropar `/auth/login` med Basic Auth
5. Om OK → sparar JWT-token krypterat + hämtar extension via `/extensions/me`
6. Sätter `telavox_connected = true`
7. Om fel → visar felmeddelande i modalen

### Frånkoppling

- Knapp "Koppla från" → rensar token, sätter `telavox_connected = false`

### Token-utgång

- Vid 401-svar från Telavox API:
  - Sätter `telavox_connected = false`
  - Visar in-app notis: "Din Telavox-koppling har gått ut — koppla om i din profil"
  - Gul varningsindikator i sidebaren/profilen
- Agenten klickar "Koppla om" → samma flow som koppling

### Backend

- `POST /api/telavox/connect` — body: `{ username, password }`
  - Anropar Telavox `/auth/login` med Basic Auth
  - Anropar `/extensions/me` med token för att verifiera + hämta extension
  - Sparar token + extension krypterat på user
  - Returnerar `{ ok: true, extension: "..." }`
- `POST /api/telavox/disconnect`
  - Rensar token, sätter connected = false
- Nytt modul: `Saleflow.Telavox.Client` — HTTP-klient mot Telavox API
  - Alla anrop går genom denna
  - Vid 401 → triggar disconnect + in-app notis

### Frontend

- Profilsidan: ny sektion "Telavox"
  - Ej kopplad: knapp "Koppla Telavox" → modal med formulär
  - Kopplad: extension-nummer + grön ikon + "Koppla från"-knapp
  - Utgången: gul varningsruta + "Koppla om"-knapp
- Admin users-panel: Telavox-statuskolumn (kopplad/ej kopplad/utgången)

---

## 3. Click-to-call

### Backend

- `POST /api/calls/dial` — body: `{ lead_id }`
  - Hämtar leadens telefonnummer (`telefon`)
  - Hämtar agentens Telavox-token
  - Anropar Telavox `GET /dial/{number}` med Bearer-token
  - Returnerar `{ ok: true }`
- `POST /api/calls/hangup`
  - Anropar Telavox `POST /hangup` med agentens token
  - Returnerar `{ ok: true }`

### Frontend

- Lead-kortet: "Ring"-knapp (telefon-ikon, grön, `--color-success`)
- Under pågående samtal: byter till "Lägg på"-knapp (röd, `--color-danger`)
- Disabled om: agent ej kopplad till Telavox, eller lead saknar telefonnummer

### Felhantering

- Agent ej kopplad → toast: "Koppla Telavox i din profil"
- 401 → triggar token-expired-flödet
- Telavox returnerar fel → toast med felmeddelande

---

## 4. Realtid — pågående samtal

### Backend

- Oban-jobb `Saleflow.Workers.TelavoxPollWorker`
  - Cron: var 5:e sekund
  - Bara under arbetstid (konfigurerbart, default 07–19)
  - Bara agenter som är inloggade + `telavox_connected = true`
  - Anropar `GET /extensions/{ext}` per agent
  - `calls`-fältet visar aktiva samtal (caller ID, direction, line status)
  - Jämför med förra pollen → detekterar nya/avslutade samtal
  - Broadcast via Phoenix PubSub till topic `"calls:live"`

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
  - Anropar `GET /calls?withRecordings=true` med agentens token
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
| `Saleflow.Telavox.Client` | HTTP-klient mot Telavox API, hanterar auth + 401 |
| `Saleflow.Telavox.Auth` | Login via Basic Auth, token-hantering |
| `Saleflow.Storage` | Cloudflare R2 upload/download/signerade URLs |
| `Saleflow.Workers.TelavoxPollWorker` | Pollar pågående samtal var 5:e sekund |
| `Saleflow.Workers.RecordingFetchWorker` | Hämtar inspelningar efter samtal |

## 9. Nya frontend-komponenter

| Komponent | Plats | Beskrivning |
|-----------|-------|-------------|
| `TelavoxConnectModal` | profil | Modal för att koppla Telavox |
| `TelavoxStatus` | profil + admin | Visar kopplingstatus |
| `DialButton` | lead-kort | Ring/lägg på-knapp |
| `LiveCalls` | dashboard | Pågående samtal-sektion |
| `RecordingPlayer` | lead-sida | Inline audiospelare |
| `TelavoxWarning` | sidebar/profil | Varning vid utgången token |

## 10. Konfiguration

### Miljövariabler (nya)

| Variabel | Beskrivning |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY` | R2 access key |
| `R2_SECRET_KEY` | R2 secret key |
| `R2_BUCKET` | R2 bucket name (`saleflow-recordings`) |

### Befintliga (oförändrade)

| Variabel | Beskrivning |
|----------|-------------|
| `TELAVOX_WEBHOOK_SECRET` | Webhook-autentisering (redan implementerat) |
