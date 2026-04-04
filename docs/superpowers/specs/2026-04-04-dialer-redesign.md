# Dialer Redesign — Design Spec

## Sammanfattning

Redesigna dialern till en LeadDesk-inspirerad layout med tabbar, mini-leaderboard, action bar, och allt på en sida utan scroll. Agenten stannar i dialern för allt arbete.

## Layout (uppifrån och ner)

### 1. Tabbar
- **Dialer** (aktiv flik) — huvudflödet, nästa kund i kön
- **Callbacks** — kunder som bett om återuppringning, badge med antal
- **Samtalshistorik** — agentens samtalshistorik (befintlig `/history`-funktionalitet)
- **Möten** — agentens möten idag (befintlig `/meetings`-funktionalitet)

Tabbarna byter innehåll i samma vy, ingen sidnavigering.

### 2. Mini-leaderboard
Horisontell rad med kompakta kort, ett per agent. Varje kort visar:
- Ranking (1, 2, 3...)
- Agentnamn
- Antal samtal idag
- Antal möten idag
- Current user markerad med blå bakgrund + "(du)"

Data: `useLeaderboard()` (samma som dashboard).

### 3. Action bar
Alltid synlig under leaderboard:
- **Ring-knapp** (grön, `--color-success`) med telefonikon
- **Telefonnummer** i monospace med `--color-bg-panel` bakgrund
- **Hoppa över** (ghost-knapp, höger)
- **Nästa kund →** (primary-knapp `--color-accent`, höger)

### 4. Huvudinnehåll (2 kolumner, 50/50)

**Vänster kolumn** — delad i 2 sub-kolumner:

*Vänster sub-kolumn:* Kundinfo
- Grid med label → value (Företag, Telefon, Stad, Adress, Bransch, Omsättning, VD, Org.nr)
- Snabblänkar som pills under (Google, Maps, Hitta, Allabolag, Eniro, Hemsida)

*Höger sub-kolumn:* Nummer + Kommentarer
- **Nummer**: Lista med alla nummer (primärt badge, extra nummer). "Lägg till"-knapp.
- **Kommentarer**: Permanenta per-kund-kommentarer från alla agenter. Visar agentnamn + datum + text. Input + "Spara" för att lägga till ny.

**Höger kolumn:**
- **Utfall**: 2x3 grid med knappar (Möte bokat, Återuppringning, Ej intresserad, Ej svar, Ring senare, Fel nummer). Möte bokat + Återuppringning har färgad bakgrund, resten neutral.
- **Anteckningar**: Textarea under utfall-knapparna.

### 5. Historik (botten)
Tabell med kundens tidigare samtal:
- Kolumner: Datum, Agent, Utfall (badge), Anteckning
- Data: `callLogs` från lead detail

## Tabbar-innehåll

### Callbacks-flik
- Lista med callbacks som är schemalagda (callback_at)
- Visar: Företag, Telefon, Schemalagd tid, Agent som satte callback
- Klick → laddar den kunden i dialern

### Samtalshistorik-flik
- Samma innehåll som `/history`-sidan
- Agentens samtal idag med datumväljare

### Möten-flik
- Samma innehåll som `/meetings`-sidan
- Agentens möten

## Backend-ändringar

### Nytt: Lead comments
- Ny tabell `lead_comments`: id, lead_id, user_id, text, inserted_at
- Ny Ash resource `Saleflow.Sales.LeadComment`
- Endpoints: `GET /api/leads/:id/comments`, `POST /api/leads/:id/comments`

### Nytt: Extra telefonnummer
- Lead-resursen har redan `telefon` och `telefon_2`. Använd befintliga fält.
- Eventuellt: ny tabell `lead_phones` för obegränsade nummer (framtid)
- Första version: visa `telefon` + `telefon_2`, möjlighet att uppdatera `telefon_2` via `PATCH /api/leads/:id`

### Callbacks endpoint
- `GET /api/callbacks` — returnerar leads med status=callback och callback_at, för current user

## Frontend-ändringar

### Nya komponenter
- `DialerTabs` — tab-komponent med 4 flikar
- `MiniLeaderboard` — horisontell leaderboard-rad
- `DialerActionBar` — ring-knapp + nummer + navigering
- `LeadComments` — kommentarslista + input
- `LeadPhones` — nummerlista med labels

### Ändrade filer
- `pages/dialer.tsx` — total omskrivning med ny layout
- `components/outcome-panel.tsx` — förenkla, integrera inline i dialern

### Tabb-routing
Ingen URL-ändring vid tabb-byte — allt sker via React state i dialern. Tabbarna renderar befintliga komponenter:
- Callbacks: ny komponent
- Samtalshistorik: återanvänd `HistoryPage`-innehåll
- Möten: återanvänd `MeetingsPage`-innehåll

## Design tokens
Alla färger via CSS-variabler:
- `--color-bg-primary: #FFFFFF`
- `--color-bg-panel: #F8FAFC`
- `--color-text-primary: #0F172A`
- `--color-text-secondary: #64748B`
- `--color-accent: #4F46E5`
- `--color-success: #059669`
- `--color-warning: #D97706` (via `#F59E0B`)
- `--color-border: #E2E8F0`
- `--color-border-input: #CBD5E1`
