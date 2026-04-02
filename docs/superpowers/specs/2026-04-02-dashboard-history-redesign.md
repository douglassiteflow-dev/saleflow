# SaleFlow — Dashboard & Historik Redesign — Design Spec

## Översikt

Tvåfas-redesign av dashboard och historik med fokus på **Clean & Minimal** designspråk, nytt mål-system med full backend-integration, Telavox-webhook för riktiga samtalsdata, och konverterings-KPI.

**Fas 1:** Dashboard-redesign + mål-system + Telavox-integration + konvertering
**Fas 2:** Historik-tabell visuell uppfräschning

---

## Designprinciper

- **Clean & Minimal** — skandinavisk känsla, luftigt, professionellt
- Tunn typografi (font-weight 300) för stora siffror
- Mjuka skuggor (0 1px 3px rgba(0,0,0,0.04)), inga borders
- 14px border-radius på kort
- Gradient progress bars (indigo pågående, grön avklarat)
- Kreativ användning av shadcn-komponenter
- Minimal chrome — låt siffrorna tala

---

## Fas 1: Dashboard Redesign

### 1.1 Backend — Goal-resurs

Ny Ash-resurs `Goal` i `saleflow/sales/`:

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | UUID | PK |
| `scope` | atom | `:global`, `:team`, `:personal` |
| `metric` | atom | `:meetings_per_week`, `:calls_per_day` (utökningsbart) |
| `target_value` | integer | Målvärde (t.ex. 15) |
| `user_id` | UUID, nullable | Satt för `:personal` scope — antingen agentens eget eller admin-satt per agent |
| `set_by_id` | UUID | Vem som satte målet |
| `active` | boolean | Kan avaktiveras utan radering |
| `period` | atom | `:daily`, `:weekly` |
| `inserted_at` | timestamp | |
| `updated_at` | timestamp | |

**Prioritetsordning vid visning:**
1. Admin-satt mål för specifik agent (`scope: :personal`, `set_by_id` ≠ `user_id`)
2. Agentens eget mål (`scope: :personal`, `set_by_id` = `user_id`)
3. Globalt mål (`scope: :global`)

**Endpoints:**
- `GET /api/goals` — hämta aktiva mål (filtrerat per roll)
- `POST /api/goals` — skapa mål (admin: alla scopes, agent: bara personliga)
- `PATCH /api/goals/:id` — uppdatera
- `DELETE /api/goals/:id` — soft-delete (active = false)
- `GET /api/dashboard/progress` — aktuell progress mot mål

**Behörigheter:**
- Admin: CRUD alla mål, sätta per-agent och globala mål
- Agent: CRUD egna personliga mål, läsa globala mål

### 1.2 Backend — Telavox Webhook-integration

Ny endpoint: `POST /api/webhooks/telavox/hangup`

Telavox konfigureras att skicka POST vid hangup-event med template-variabler.

**Förväntad payload:**
```json
{
  "caller": "+46701234567",
  "callee": "+46812345678",
  "duration": 145
}
```

**Säkerhet:**
- IP-vitlista: 80.83.208.0/20 (Telavox nätverksrange)
- Alternativt: auth-header som konfigureras i Telavox Admin Portal

**Logik:**
1. Validera request (IP eller auth-header)
2. Matcha `callee` mot lead-telefonnummer i databasen
3. Matcha `caller` mot agent (kräver att agenter har telefonnummer registrerat i sin profil)
4. Skapa `PhoneCall`-post
5. `CallLog` kopplas till `PhoneCall` när agenten loggar utfall

**Ny Ash-resurs: `PhoneCall`** i `saleflow/sales/`:

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | UUID | PK |
| `lead_id` | UUID, nullable | Matchad lead via telefonnummer |
| `user_id` | UUID, nullable | Matchad agent via uppringarnummer |
| `caller` | string | Uppringarens nummer (E.164) |
| `callee` | string | Uppringt nummer (E.164) |
| `duration` | integer | Samtalslängd i sekunder |
| `call_log_id` | UUID, nullable | Kopplad utfallslogg (sätts senare) |
| `received_at` | timestamp | När webhooken togs emot |
| `inserted_at` | timestamp | |

**Förändring av KPI-beräkning:** Dashboard-KPI:er "samtal idag" och "totalt samtal" räknar nu `PhoneCall` istället för `CallLog`. Konverteringsgraden baseras på `PhoneCall`-count → meetings.

**Ny profil-fält:** `phone_number` (string) på User-resursen för att matcha agent mot uppringarnummer.

### 1.3 Backend — Konverterings-KPI

Utökat `GET /api/dashboard`-response:

```json
{
  "conversion": {
    "calls_today": 47,
    "meetings_today": 5,
    "rate": 10.6
  }
}
```

Beräkning: `(möten idag / samtal idag) * 100`. Noll samtal = 0%.

Samma logik per agent (personlig) och globalt (alla). Ingen ny tabell — query mot `phone_calls` + `meetings`.

### 1.4 Frontend — Dashboard

**Bort:**
- Globala lead-statusräknare (6 st StatCards)
- Callbacks-sektion
- Dagens möten-sektion

Dessa blir notifikationer/email istället.

**Ny layout (vertikal stack):**

1. **Header** — "Hej {namn}" + datum + "Nästa kund →" knapp
2. **Personliga KPI:er** — 3 kort i rad:
   - Samtal idag (från PhoneCall)
   - Möten idag
   - Konvertering (%)
3. **Veckans mål** — Progress bars med gradient:
   - Möten denna vecka: X / target (indigo gradient)
   - Samtal per dag: X / target (grön gradient vid uppnått)
   - Visar veckonummer + "X av Y dagar"
4. **Leaderboard** — Redesignad:
   - Gradient-cirkel för #1, grå för övriga
   - Visar både möten och samtal per agent
   - LIVE-badge
   - Highlightar nuvarande användare

**shadcn-komponenter:**
- `Card` — 14px rounded, mjuka skuggor
- `Progress` — gradient progress bars
- `Badge` — LIVE-indikator
- `Button` — "Nästa kund" CTA

---

## Fas 2: Historik Redesign

Samma tabellstruktur men uppfräschad visuellt:

**Visuella förbättringar:**
- Clean & Minimal-stil matchande dashboard (14px corners, mjuka skuggor, tunn typografi)
- Färgkodade event-ikoner per action-typ:
  - Grön: möte (created/completed)
  - Blå: samtal (call.logged)
  - Amber: statusändring
  - Grå: system (session, OTP)
- Bättre typografi — mer luft, tydligare hierarki
- shadcn `Select` istället för rå `<select>` för action-filter
- shadcn `Input` med sökikon
- shadcn `DatePicker` för datumintervall-filtrering (nytt)
- Paginering med shadcn (idag laddas allt på en gång)

**Backend-stöd för paginering:**
- `GET /api/audit` stödjer `?page=1&page_size=50&from_date=&to_date=`

**Ingen funktionell förändring** utöver datumfilter och paginering.

---

## Databasmigrationer

### Migration 1: Goals
```
create table goals (
  id uuid primary key,
  scope varchar not null,        -- 'global', 'team', 'personal'
  metric varchar not null,       -- 'meetings_per_week', 'calls_per_day'
  target_value integer not null,
  user_id uuid references users(id),
  set_by_id uuid not null references users(id),
  active boolean not null default true,
  period varchar not null,       -- 'daily', 'weekly'
  inserted_at timestamp not null,
  updated_at timestamp not null
)
```

### Migration 2: PhoneCalls
```
create table phone_calls (
  id uuid primary key,
  lead_id uuid references leads(id),
  user_id uuid references users(id),
  caller varchar not null,
  callee varchar not null,
  duration integer not null default 0,
  call_log_id uuid references call_logs(id),
  received_at timestamp not null,
  inserted_at timestamp not null
)

create index phone_calls_callee_index on phone_calls(callee)
create index phone_calls_user_id_index on phone_calls(user_id)
create index phone_calls_received_at_index on phone_calls(received_at)
```

### Migration 3: User phone number
```
alter table users add column phone_number varchar
create unique index users_phone_number_index on users(phone_number)
```

---

## Ej i scope

- Notifikationssystem (callbacks, möten) — separat feature
- Admin-dashboard med globala lead-statusräknare — kan bli egen vy senare
- Samtalshistorik per lead baserat på PhoneCall — framtida förbättring
- Telavox polling-API som backup — webhook first
