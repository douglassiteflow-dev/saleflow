# Sales Pipeline v2 — Design Spec

## Overview

Pipeline v2 ersätter den befintliga hemsidecentrerade pipelinen (v1) med ett rent säljprocessfokuserat flöde. Hemsidegenerering (Flowing AI) triggas automatiskt vid bokning istället för manuellt av admin. Avtalssystemet porteras från Pageflow med realtidsspårning, canvas-signering och PDF-generering.

**Ansats:** Refaktorera befintlig Deal-resurs — byt stages, bygg nya frontend-sidor, ny wizard. Behåll fungerande infrastruktur (audit trail, PubSub, auth, API hooks).

---

## Pipeline-steg

| # | Stage key | Label (UI) | Ägare | Trigger |
|---|-----------|------------|-------|---------|
| 1 | `booking_wizard` | Bokning pågår | Agent | Agent bokar möte i dialern |
| 2 | `demo_scheduled` | Demo schemalagd | System | Wizard slutförd, Flowing AI triggered |
| 3 | `meeting_completed` | Möte genomfört | Agent | Agent loggar utfall efter mötet |
| 4 | `questionnaire_sent` | Formulär skickat | System | Agent skickar formulär till kund |
| 5 | `contract_sent` | Avtal skickat | Agent | Agent skickar avtal |
| 6 | `won` | Kund | System | Kund signerar avtal |

Plus `cancelled` som terminal state.

**Regler:**
- Steg kan inte hoppas över (linjärt flöde)
- `booking_wizard` är kortlivat — försvinner så fort wizarden slutförs
- `demo_scheduled` kan ha flera möten (uppföljningar)
- `meeting_completed` promptar agenten direkt med utfallsformulär
- `contract_sent` kan skickas om vid omförhandling (ny version, samma steg)

---

## Datamodell

### Deal (ändrade fält)

| Fält | Ändring | Beskrivning |
|------|---------|-------------|
| `stage` | **Byt enum** | `booking_wizard`, `demo_scheduled`, `meeting_completed`, `questionnaire_sent`, `contract_sent`, `won`, `cancelled` |
| `meeting_outcome` | **Nytt**, text nullable | Agentens anteckning om hur mötet gick |
| `needs_followup` | **Nytt**, boolean default false | Om uppföljning behövs |
| `website_url` | Behåll | Demo-länk från Flowing AI |
| `notes` | Behåll | Agentens kommentarer |
| `domain`, `domain_sponsored` | Behåll | Kundens domän |

**Ta bort:** `contract_url` (ersätts av Contract-relation)

**Relationer (via FK på child-resurser):**
- Deal has_many Contracts (via `contract.deal_id`) — flera vid omförhandling
- Deal has_one Questionnaire (via `questionnaire.deal_id`)
- Deal has_many Meetings (via `meeting.deal_id`) — som idag

### Questionnaire (ny resurs)

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `deal_id` | uuid FK | Koppling till deal |
| `token` | string, unique | Publik URL-token (ingen inloggning) |
| `status` | enum | `pending`, `in_progress`, `completed` |
| `customer_email` | string | Mottagarens email |
| `capacity` | string nullable | "1-10", "10-20" etc. |
| `color_theme` | string nullable | Önskad färg |
| `services_text` | text nullable | Fritext tjänster |
| `services_file_url` | string nullable | Uppladdad tjänstlista |
| `custom_changes` | text nullable | Ändringsönskemål |
| `wants_ads` | boolean nullable | Betalda annonser |
| `most_profitable_service` | string nullable | Mest lönsamma tjänst |
| `wants_quote_generator` | boolean nullable | Offertgenerering på hemsidan |
| `addon_services` | array of strings | Valda tilläggstjänster |
| `media_urls` | array of strings | Uppladdade bilder/videos |
| `completed_at` | utc_datetime nullable | När kunden slutförde |

### QuestionnaireTemplate (ny resurs)

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `name` | string | Template-namn |
| `questions` | jsonb | Konfigurerbara frågor och alternativ |
| `is_default` | boolean | Standard-template |

### Contract (portad från Pageflow)

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `deal_id` | uuid FK | Koppling till deal |
| `contract_number` | string | Auto-genererat: "SF-2026-0001" |
| `status` | enum | `draft`, `sent`, `viewed`, `signed`, `superseded` |
| `access_token` | string unique | URL-token för publik åtkomst |
| `verification_code` | string | 6-siffrig kod |
| `recipient_email` | string | Kundens email |
| `recipient_name` | string | Kundens namn |
| `amount` | decimal | Pris |
| `terms` | text | Villkor |
| `currency` | enum | `:SEK` default |
| `customer_signature_url` | string nullable | Canvas-signatur (base64 PNG) |
| `customer_name` | string nullable | Signerat namn |
| `customer_signed_at` | utc_datetime nullable | Signeringstidpunkt |
| `seller_name` | string | Säljaren |
| `seller_signed_at` | utc_datetime | Satt vid skapande |
| `pdf_url` | string nullable | Osignerat avtal PDF |
| `signed_pdf_url` | string nullable | Signerat avtal PDF |
| `last_viewed_page` | string nullable | Senast visade sida |
| `total_view_time` | integer default 0 | Total tid i sekunder |
| `page_views` | map | Per-sektions tid: `{"försättsblad": 45}` |
| `expires_at` | utc_datetime nullable | Länkens utgång |
| `version` | integer default 1 | Version vid omförhandling |
| `auto_renew` | boolean default false | Auto-förnyelse |
| `renewal_status` | enum | `active`, `pending_renewal`, `renewed`, `cancelled` |
| `renewal_date` | date nullable | Beräknat förnyelsedatum |
| `cancelled_at` | utc_datetime nullable | Uppsägningsdatum |
| `cancellation_end_date` | date nullable | Uppsägningstid slut |
| `custom_fields` | map | Godtycklig data |
| `user_id` | uuid FK | Agenten/säljaren |

### ContractTemplate (portad från Pageflow)

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `name` | string | Template-namn |
| `header_html` | string | Anpassad header |
| `footer_html` | string | Sidfot |
| `terms_html` | string | Villkor-HTML |
| `logo_url` | string | Logotyp |
| `primary_color` | string default "#0f172a" | Temafärg |
| `font` | string default "Inter" | Typsnitt |
| `is_default` | boolean | Standard-mall |
| `user_id` | uuid FK | Skapare |

### DiscountCode (portad från Pageflow)

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `code` | string unique | Kod (versaler) |
| `type` | enum | `percent`, `fixed_amount` |
| `value` | integer | Värde (25 = 25% eller 500 kr) |
| `valid_from` | date | Giltigt från |
| `valid_until` | date | Giltigt till |
| `max_uses` | integer nullable | Max användningar |
| `current_uses` | integer default 0 | Nuvarande användningar |
| `active` | boolean default true | Aktiv |

---

## Wizard vid bokning (ny, byggas om helt)

Wizarden triggas från dialern när agent bokar möte. Ersätter befintlig DemoConfig.

### Steg 1: Mötesinbjudan

- Kundens namn (från lead)
- Email (från lead, redigerbart)
- Datum & tid (datumväljare + tidväljare)
- Mötestyp: Teams (default)
- Anteckningar (fritext, valfritt)

→ "Nästa" skapar mötet och skickar inbjudan

### Steg 2: Konfigurera demo

- Har kunden Bokadirekt?
  - Ja → Klistra in Bokadirekt-länk
  - Nej → Välj alternativ:
    - Befintlig hemsida → Klistra in URL
    - Manuellt → Fyll i företagsinfo + ladda upp logga

→ "Slutför" triggar Flowing AI automatiskt i bakgrunden

### UX-detaljer

- Wizard som modal/overlay i dialern (inte ny sida)
- Steg-indikator högst upp (Steg 1 av 2)
- Validering inline — tydliga felmeddelanden på svenska
- "Slutför"-knappen disablas medan Flowing AI triggas, spinner + "Genererar demo..."
- Vid lyckat: deal skapas med stage `demo_scheduled`, wizard stängs, toast "Demo schemalagd för [Företag]"
- Vid fel: tydligt felmeddelande, möjlighet att försöka igen

### Bakgrundsprocess

1. Deal skapas med stage `booking_wizard`
2. Meeting skapas och kopplas till deal
3. Flowing AI triggas (scrape → generate → deploy, kedjat)
4. När Flowing AI klar → `website_url` sparas på deal
5. Deal stage → `demo_scheduled`
6. Audit log för varje steg

### Felhantering Flowing AI

Om Flowing AI misslyckas i något steg (scrape/generate/deploy):
- Deal stannar kvar på `booking_wizard` (går ej vidare till `demo_scheduled`)
- Agenten ser felmeddelande med beskrivning av vad som gick fel
- Knapp "Försök igen" triggar om hela kedjan
- Audit log registrerar felet
- Mötet är redan skapat och inbjudan skickad — det påverkas inte

---

## Kundformulär (publik sida)

### Leverans

- Agent klickar "Skicka formulär" på deal-detaljsidan
- System genererar unik token-URL: `siteflow.se/q/{token}`
- Email skickas till kund med länk
- Deal stage → `questionnaire_sent`

### Wizard-steg för kunden

Fristående sida — ingen navbar, inget login.

**Steg 1 — Kapacitet**
> "Hur många fler kunder kan du hantera per dag?"
- Radio-knappar: 1-10, 10-20, 20-30, 30-40, 50-100, Obegränsat
- Infotext: "Svaret avgör hur starkt vi pushar din hemsida i Google-resultaten"

**Steg 2 — Utseende**
- Färgväljare / skriv in färgkod
- Välj färgpalett (förhandsvisning)

**Steg 3 — Tjänster**
- Ladda upp tjänstlista (xlsx, pdf) ELLER
- Skriv in i fritext (tjänstnamn + pris + beskrivning) ELLER
- Klistra in länk till källa

**Steg 4 — Media**
- Drag & drop / klicka för att ladda upp bilder och videos
- Förhandsvisning av uppladdade filer

**Steg 5 — Tilläggstjänster**

Varje tjänst visas som kort/checkbox med ikon + namn + säljande tooltip:

| Tjänst | Tooltip |
|--------|---------|
| Professionell företags-email | "Ge ditt företag en professionell look med @dittföretag.se — inga fler Gmail-adresser till kunder" |
| Företagsnummer / Växel | "Ett eget företagsnummer med vidarekoppling, hälsningsfras och köhantering" |
| AI-Receptionist | "En AI som svarar i telefon, bokar möten åt dig och en chattbubbla på hemsidan som hjälper kunder dygnet runt" |
| Avancerad SEO | "Hamna högst på Google — vi optimerar din hemsida så att kunderna hittar dig först" |
| Journalsystem / Journalkoppling | "Digitalt journalsystem integrerat med din hemsida och bokning" |
| Schemaläggning & Personal | "Hantera personalscheman, skift och semestrar enkelt i ett system" |
| Bokningssystem | "Låt kunder boka tid direkt via din hemsida — automatiska påminnelser och kalendersynk" |
| Ta betalt online | "Kortbetalning direkt på hemsidan — Swish, kort, faktura, allt på ett ställe" |
| Webshop | "Sälj produkter online med lagerhantering, frakt och betalning" |
| Betalda annonser | "Marknadsföring via Facebook, Instagram och Snapchat — vi sköter allt åt dig" |
| Offertgenerering | "Dina kunder kan begära prisförslag direkt via hemsidan" |

Listan är konfigurerbar via `QuestionnaireTemplate` (kan lägga till fler tjänster utan koddeploy).

**Steg 6 — Övrigt**
- "Vilken tjänst tjänar du mest pengar på?" (fritext)
- "Vill du ändra/lägga till något specifikt?" (fritext)

**Steg 7 — Klar**
- Sammanfattning av alla svar
- "Skicka" → status `completed`, deal notifieras

### UX-detaljer

- Mobilanpassad (kunder fyller troligen i på telefon)
- Progress-bar högst upp
- Autospar — kunden kan stänga och komma tillbaka via samma länk
- Varje steg har "Tillbaka" och "Nästa"
- Validering: inga obligatoriska fält utom kapacitet (steg 1)
- Uppladdning: max 50MB per fil, vanliga bildformat + video + xlsx + pdf
- Tack-sida efter inskick: "Tack! Vi återkommer när din hemsida är redo"

---

## Avtalssystem (portat från Pageflow)

### Flöde

1. Agent klickar "Skicka avtal" på deal-detaljsidan
2. Formulär öppnas: pris, villkor (förifyllt från template), kundens email
3. Agent justerar pris/villkor → "Skicka"
4. Contract skapas (version 1), email skickas till kund
5. Deal stage → `contract_sent`
6. Kund får email med länk: `siteflow.se/contract/{token}`
7. Kund verifierar med 6-siffrig kod
8. Kund läser avtal — agent ser i realtid vilken sida, hur länge
9. Kund signerar (canvas-signatur)
10. Deal stage → `won`

### Omförhandling

- Kund nekar / vill omförhandla → agent skapar nytt avtal (version+1)
- Gammalt avtal → status `superseded`
- Deal stannar på `contract_sent`

### Realtidsspårning (WebSocket)

- Kanal: `contract:{token}`
- IntersectionObserver trackar vilken sektion kunden läser
- Heartbeat var 1:a sekund — tid per sektion
- Flush till DB var 5:e sekund
- Agent ser live: "Kunden läser: Prisöversikt (45s)"

### PDF-generering

- ChromicPDF (HTML → PDF)
- 5 sidor: försättsblad, tjänstbeskrivning, prisöversikt, villkor, signering
- Anpassningsbart via ContractTemplate (logga, färg, typsnitt, villkor)
- Signerat PDF genereras vid signering med kundens canvas-signatur inbäddad

### Email-notiser

| Trigger | Mottagare | Innehåll |
|---------|-----------|----------|
| Avtal skickat | Kund | Länk till avtal + verifieringskod |
| Avtal visat | Agent | "Kunden har öppnat avtalet" |
| Avtal signerat | Agent + admin | "Avtalet är signerat" |
| Påminnelse (3+ dagar) | Kund | "Du har ett avtal som väntar" |
| Utgår snart (30 dagar) | Agent | "Avtalet går ut snart" |

### Oban-jobb

| Jobb | Schema | Syfte |
|------|--------|-------|
| `AutoRenewContractsJob` | Dagligen 06:00 | Förnya avtal automatiskt |
| `CheckExpiringContractsJob` | Dagligen | Notifiera om avtal som går ut |
| `SendContractRemindersJob` | Dagligen 09:00 | Påminn kunder som inte signerat |

### Rabattkoder

- Procent eller fast belopp
- Giltighetsperiod + max användningar
- Agent applicerar vid avtalsskapande

---

## Backend API

### Deal endpoints (ändrade)

| Metod | Route | Ändring |
|-------|-------|---------|
| `GET /api/deals` | Behåll | Nya stages i response |
| `GET /api/deals/:id` | Behåll | Inkludera questionnaire + contract |
| `POST /api/deals/:id/advance` | Behåll | Ny stage-logik |
| `PATCH /api/deals/:id` | Behåll | Nya fält: `meeting_outcome`, `needs_followup` |
| `POST /api/deals/:id/send-questionnaire` | **Ny** | Skapar Questionnaire, skickar email |
| `POST /api/deals/:id/send-contract` | **Ny** | Skapar Contract, skickar email |

### Questionnaire endpoints (nya, publika)

| Metod | Route | Syfte |
|-------|-------|-------|
| `GET /q/:token` | Hämta formulärdata + frågor |
| `PATCH /q/:token` | Autospar svar |
| `POST /q/:token/complete` | Markera som slutfört |
| `POST /q/:token/upload` | Ladda upp bilder/filer |

### Contract endpoints (portade från Pageflow)

| Metod | Route | Auth | Syfte |
|-------|-------|------|-------|
| `GET /api/contracts/:token` | Publik | Hämta avtalsinfo |
| `POST /api/contracts/:token/verify` | Publik | Verifiera 6-siffrig kod |
| `POST /api/contracts/:token/sign` | Publik | Canvas-signering |
| `GET /api/contracts/:token/pdf` | Publik | Ladda ner PDF |
| `PATCH /api/contracts/:token` | Publik | Tracking-data (WebSocket flush) |
| `POST /api/contracts` | Auth | Skapa avtal |
| `POST /api/contracts/:id/send-email` | Auth | Skicka/skicka om |
| `POST /api/contracts/:id/cancel-contract` | Auth | Säga upp avtal |
| `PATCH /api/contracts/:id/toggle-auto-renew` | Auth | Auto-förnyelse |
| `GET /api/contract-templates` | Admin | Lista mallar |
| `POST /api/contract-templates` | Admin | Skapa mall |
| `PATCH /api/contract-templates/:id` | Admin | Redigera mall |
| `GET /api/discount-codes` | Admin | Lista rabattkoder |
| `POST /api/discount-codes` | Admin | Skapa rabattkod |
| `POST /api/contracts/:id/apply-discount` | Auth | Applicera rabattkod |

### Flowing AI (kedjad bakgrundsprocess)

Triggas automatiskt av wizard-completion:
1. `POST /api/admin/deals/:id/scrape` → scrapa företagsdata
2. `POST /api/admin/deals/:id/generate` → generera hemsida
3. `POST /api/admin/deals/:id/deploy` → deploya, spara `website_url`

### WebSocket-kanaler

| Kanal | Syfte |
|-------|-------|
| `contract:{token}` | **Ny** — realtidsspårning av avtal |
| `dashboard:updates` | Behåll — deal-ändringar |

---

## Frontend

### Admin webapp

**Pipeline-sida (`/pipeline`)** — redesignas
- Listvy grupperad efter 6 nya stages
- Deal-rad: Företag | Agent | Tid i steget | Status-badge
- Klick → deal-detalj

**Deal-detaljsida (`/pipeline/:id`)** — redesignas
- Stegindikator med 6 steg (horisontell stepper)
- Kontextberoende innehåll per steg:
  - `demo_scheduled`: Mötesinfo + förhandsgranskning demo-hemsida + "Gå till möte"
  - `meeting_completed`: Utfall, kommentarer, uppföljningsstatus
  - `questionnaire_sent`: Formulärstatus (väntar/pågår/slutfört) + kundens svar
  - `contract_sent`: Realtidsspårning — vilken sida kunden läser, tid per sektion
  - `won`: Sammanfattning — avtal, hemsida, domän, kund
- Högerkolumn: Företagsinfo från lead
- Möten-lista + audit trail/historik

**Kunder-sida (`/customers`)**
- Deals med stage `won`
- Lista med företag, agent, avslutsdatum, domän

### Agent Electron-app (dialer)

**Deals-tab** — redesignas
- Agentens aktiva deals med nya stages/badges
- Klick → deal-detalj

**Deal-detalj** — redesignas
- Stegindikator (read-only)
- Demo-länk (prominent, kopiera/öppna)
- Kontextberoende actions:
  - `demo_scheduled`: "Gå till möte" när datum närmar sig
  - `meeting_completed`: Utfallsformulär (hur gick det, uppföljning, kommentarer)
  - `questionnaire_sent`: "Skicka formulär" + status
  - `contract_sent`: "Skicka avtal" + live-spårning
- Möten-lista

**Ny wizard-modal** — byggas om helt
- Ersätter befintlig DemoConfig
- Steg 1: Mötesinbjudan
- Steg 2: Demo-config → Flowing AI auto-trigger

### Kundformulär (`siteflow.se/q/{token}`)

- Fristående publik sida
- Wizard med 7 steg
- Mobilanpassad, progress-bar, autospar
- Tilläggstjänster med säljande tooltips
- Tack-sida efter inskick

### Avtalssida (`siteflow.se/contract/{token}`)

- Fristående publik sida (portad från Pageflow)
- 6-siffrig kodverifiering
- Interaktivt avtal med sektioner
- Canvas-signatur
- Realtidsspårning via WebSocket
- Tack-sida + PDF-nedladdning

---

## Utanför scope

- BankID-signering (canvas räcker)
- Transkribering/AI coach vid mötesinspelning
- Migration av befintliga v1-deals (separat fas)
- Konfigurerbar pipeline (fas 3)
- Multi-tenant / SaaS

---

## Kvalitetskrav

- 100% test coverage — backend (ExUnit) och frontend (Vitest)
- Inga test-skips
- Full audit trail — alla mutationer på Deal, Questionnaire, Contract loggas
- DRY — ingen duplicerad kod
- Alla sidor matchar dashboardens design (sizing, typsnitt, färger, spacing)
- Svenska (ÅÄÖ) i all UI-text
- Mobilanpassat kundformulär + avtalssida
- Användarvänligt UX genomgående
