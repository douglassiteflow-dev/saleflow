# Uppföljnings-flöde — Design

**Datum:** 2026-04-09
**Status:** Approved

## Mål

Ersätta den nuvarande tråkiga "Skicka inbjudan"-knappen i demo_config-följningen med ett komplett uppföljnings-flöde där agenten, efter att ha hållit demo-mötet, kan boka ett uppföljningsmöte och samtidigt skicka ett rikt mail med tre länkar: preview-hemsidan, frågeformuläret, och Teams-uppföljningsmötet.

## Bakgrund

Nuvarande demo_config-pipeline:

```
meeting_booked → generating → demo_ready → followup
```

Problem:
- "Skicka inbjudan"-knappen skickar bara Microsoft Graphs auto-genererade kalenderinbjudan utan någon hälsning eller frågeformulär
- Inget separat mail till kunden med preview-länk eller frågeformulär
- Saknas intermediärt stadie mellan "hemsidan klar" och "uppföljning bokad"
- Demo-länken i UI pekar på raw Vercel-URL, inte vår `demo.siteflow.se/{slug}`

## Ny pipeline

```
meeting_booked → generating → demo_ready → demo_held → followup → cancelled
                                            ↑ NYTT
```

- **demo_ready** — Hemsidan är klar, väntar på att demo-mötet ska genomföras
- **demo_held** — Demo-mötet är genomfört, dags att boka uppföljning (NYTT)
- **followup** — Uppföljningsmöte bokat, frågeformulär skickat

Transitionen `demo_ready → demo_held` sker **automatiskt** när agenten markerar demo-mötet som completed (befintlig knapp i meeting detail). Transitionen `demo_held → followup` sker när agenten klickar "Boka uppföljning" och skickar mailet.

## Agent-flöde

### Steg: demo_held (nytt)

- Rubrik: "Demo-mötet är genomfört"
- Visar länk till deras preview-hemsida (`https://demo.siteflow.se/{slug}`)
- Knapp: **"Boka uppföljning"** → öppnar modal

### Modal: Boka uppföljning

**Rubrik:** "Boka uppföljning med {företagsnamn}"

**Steg 1 — Välj tid:**
- Datum (`<input type="date">`)
- Tid (`<TimeSelect>`)
- Default duration: 30 min

**Steg 2 — Personligt meddelande:**
- Textarea med default-text ("Vi pratade om några justeringar under mötet, så fyll gärna i formuläret nedan med dina preferenser så anpassar vi hemsidan.")
- Max 500 tecken

**Steg 3 — Preview:**
- Rendrad HTML-preview av mailet med kundens namn, datum, alla tre länkar, och det personliga meddelandet
- Knapp **"Skicka"** och **"Avbryt"**

### Steg: followup

Visar kundstatus-tracking:

```
✉️  Mail skickat:         2026-04-09 14:32
👁  Frågeformulär öppnat:  2026-04-09 14:45
✏️  Formulär påbörjat:     2026-04-09 14:47
✅  Formulär ifyllt:       —
```

Plus de tre länkarna (kopierbara):
- Preview-hemsida
- Frågeformulär
- Teams-uppföljningsmöte

## Språkstöd

Mailet stöder **svenska** och **engelska**. Agenten väljer språk i modalen (default: svenska). Två separata EEx-mallar, en per språk. Subjekt, knappar och brödtext översätts; personligt meddelande skrivs av agenten i valfritt språk.

## Mail-mall (delvis redigerbar)

```
Subject: Uppföljning — {företagsnamn}

Hej {namn}!

Tack för ett trevligt demo-möte idag. Det var roligt att visa hur
hemsidan kan se ut — här är länken så du kan titta på den igen i lugn
och ro:

[Visa din hemsida →]   https://demo.siteflow.se/{slug}

{PERSONLIGT MEDDELANDE — redigerbart av agenten}

Fyll i vårt frågeformulär så kan vi konfigurera hemsidan efter era
preferenser. Bildfält kan lämnas tomma, och självklart kan vi ändra
vad som helst senare.

[Fyll i formuläret →]   https://siteflow.se/q/{token}

Vi har även bokat in ett kort uppföljningsmöte där vi går igenom
ändringarna tillsammans:

📅 {datum} kl {tid}
[Anslut till Teams-mötet →]   {teams_join_url}

Vid frågor, svara bara på detta mail.

Hälsningar,
{Agentnamn}
Siteflow
```

Endast **{PERSONLIGT MEDDELANDE}** är redigerbart. Resten är fast.

## Dataändringar

### `demo_configs.stage` — nytt värde

Lägg till `:demo_held` mellan `:demo_ready` och `:followup` i stage-enum.

### `questionnaires` — nya kolumner

- `lead_id UUID NULL` — ny valfri relation (så vi kan skapa questionnaire utan deal)
- `opened_at TIMESTAMPTZ NULL` — när `/q/:token` GETades första gången
- `started_at TIMESTAMPTZ NULL` — när första svaret sparades
- `deal_id` är redan `allow_nil? true`, ingen ändring

### `demo_configs.preview_url` — betydelse ändras

- **Innan:** Raw Vercel-URL (t.ex. `https://sakura-...vercel.app`)
- **Efter:** Friendly URL (`https://demo.siteflow.se/{slug}`)
- `website_path` används för raw URL (oförändrat)

## Backend-ändringar

### 1. DemoConfig resource

- Lägg till `:demo_held` i stage enum
- Ny action `advance_to_demo_held` (demo_ready → demo_held)
- Ändra `advance_to_followup` att kräva `demo_held` (inte demo_ready)

### 2. Questionnaire resource

- Lägg till attribute `lead_id :uuid, allow_nil? true`
- Lägg till attribute `opened_at :utc_datetime_usec, allow_nil? true`
- Lägg till attribute `started_at :utc_datetime_usec, allow_nil? true`
- Ny action `mark_opened` — sätter `opened_at = now()` om null
- Ändra `save_answers` — sätter `started_at = now()` om null
- Relation till lead

### 3. Meeting controller

- Ändra `maybe_advance_demo_config`: när demo_config är i `demo_ready` → advancera till `demo_held` (inte `followup`)

### 4. Ny endpoint: `POST /api/demo-configs/:id/book-followup`

Body:
```json
{
  "meeting_date": "2026-04-16",
  "meeting_time": "14:00",
  "personal_message": "Stort tack för idag Misha..."
}
```

Logic:
1. Validera att demo_config är i `demo_held`
2. Skapa nytt `Meeting`-record:
   - `lead_id`, `user_id` från demo_config
   - `title: "Uppföljning — {lead.företag}"`
   - `meeting_date`, `meeting_time`, `duration_minutes: 30`
   - `demo_config_id: demo_config.id`
   - `status: :scheduled`
3. Skapa Teams-möte via Microsoft Graph (`Graph.create_meeting_with_invite`) utan attendee-invite (vi skickar egen)
   - Uppdatera meeting med `teams_join_url` + `teams_event_id`
4. Skapa `Questionnaire`-record:
   - `lead_id: demo_config.lead_id`
   - `customer_email: lead.epost` (eller override från params)
   - `token: random_base64`
   - `status: :pending`
5. Skicka HTML-mail via `Notifications.Mailer.send_email_async`:
   - Till: `lead.epost`
   - Ämne: `"Uppföljning — #{lead.företag}"`
   - Body: renderad mall (se ovan)
6. Advancera `demo_config` → `followup`
7. Returnera `%{demo_config, meeting, questionnaire}`

### 5. Ny endpoint: `GET /api/demo-configs/:id/followup-preview`

Query params: `meeting_date`, `meeting_time`, `personal_message`
Returnerar: `%{html: "<rendered mail html>", subject: "..."}`
Används för preview i modal innan skicka.

### 6. Public questionnaire controller

- Ändra `GET /q/:token`: sätt `opened_at = now()` om null (call `Sales.mark_questionnaire_opened`)

### 7. DemoGenerationWorker — fix preview_url

Ändra `poll_genflow_job` success case:
```elixir
slug = Saleflow.Generation.get_job_slug(job_id)  # från GenerationJob.slug
friendly_url = "https://demo.siteflow.se/#{slug}"

Sales.generation_complete(demo_config, %{
  website_path: result_url,       # raw vercel URL (för proxy)
  preview_url: friendly_url       # för UI + mail
})
```

### 8. Demo lookup controller — använd website_path

Ändra `find_by_demo_config` att returnera `config.website_path` istället för `config.preview_url`.

### 9. Email template

Ny modul `Saleflow.Notifications.FollowupEmail`:
- `render(params) :: {subject, html}`
- Tar: lead, meeting, questionnaire_token, preview_url, personal_message, agent_name
- Renderar HTML-mall via EEx template i `priv/templates/followup_email.html.eex`

### 10. Sales domain functions

- `Sales.advance_to_demo_held(demo_config)`
- `Sales.book_followup(demo_config, params, user)` — hela orkestreringen
- `Sales.mark_questionnaire_opened(questionnaire)`
- `Sales.create_questionnaire_for_lead(params)` — ny create action med lead_id

## Frontend-ändringar

### 1. Typer (`api/types.ts`)

```typescript
export type DemoStage =
  | "meeting_booked"
  | "generating"
  | "demo_ready"
  | "demo_held"    // NYTT
  | "followup"
  | "cancelled";

export interface Questionnaire {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  token: string;
  status: "pending" | "in_progress" | "completed";
  customer_email: string;
  opened_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  inserted_at: string;
  updated_at: string;
}

export interface DemoConfigDetail extends DemoConfig {
  lead: Lead;
  meetings: Meeting[];
  questionnaire: Questionnaire | null;   // NYTT
}
```

### 2. Demo stage indicator + tab

- Lägg till `demo_held: { label: "Demo genomfört", bg: "#fef3c7", text: "#92400e" }` i `demo-tab.tsx`
- Lägg till `demo_held: 3` i stage-order och update `followup: 4` i `demo-stage-indicator.tsx`

### 3. Demo-detail-tab nytt stadie-innehåll

```tsx
{data.stage === "demo_held" && <DemoHeldContent data={data} />}
```

`DemoHeldContent` visar:
- Rubrik
- Preview-länk (öppnar i ny flik)
- Knapp "Boka uppföljning" → öppnar modal

### 4. Ny komponent: `BookFollowupModal`

**Fil:** `frontend/src/components/dialer/book-followup-modal.tsx`

Props: `demoConfigId`, `leadName`, `open`, `onClose`, `onSuccess`

Intern state: `date`, `time`, `personalMessage`, `previewHtml`, `step` (1=tid, 2=meddelande+preview, 3=skickar)

Flöde:
1. Agent fyller i datum/tid och personligt meddelande
2. Fetch `GET /api/demo-configs/:id/followup-preview?...` → visa HTML iframe
3. Agent klickar Skicka → `POST /api/demo-configs/:id/book-followup` → stäng modal

### 5. Uppdaterad FollowupContent

- Visa tracking-rader (mail skickat, öppnat, påbörjat, ifyllt) med timestamps
- Visa alla tre länkar (kopierbara)

### 6. API-hooks

Ny fil `frontend/src/api/followup.ts`:
- `useBookFollowup()` — mutation för POST
- `usePreviewFollowupMail()` — query för GET preview

## Tracking-flöde

1. Agent skickar mail → `demo_config.followup_sent_at = now()` (eller härlett från `advance_to_followup` audit log)
2. Kund klickar länk → `GET /q/:token` → `questionnaire.opened_at = now()`
3. Kund börjar svara → `save_answers` action → `questionnaire.started_at = now()`, `status = :in_progress`
4. Kund klickar "Skicka in" → `complete` action → `questionnaire.status = :completed`, `completed_at = now()`

I frontend visas timestamps med `formatDate(value) + " " + formatTime(value)` eller "—" om null.

## Testning

### Backend-tester (100% täckning)

- `demo_config_test.exs`:
  - `advance_to_demo_held` från olika stadier (bara demo_ready → demo_held OK)
  - `advance_to_followup` kräver demo_held nu
- `questionnaire_test.exs`:
  - Skapa med lead_id istället för deal_id
  - `mark_opened` sätter opened_at endast första gången
  - `save_answers` sätter started_at vid första save
- `meeting_controller_test.exs`:
  - `update_status` till completed → demo_config går till demo_held (inte followup)
- `demo_config_controller_test.exs`:
  - `POST /book-followup` happy path — skapar allt och advancear
  - Fel om demo_config inte är i demo_held
  - Fel om ingen MS-connection
  - `GET /followup-preview` returnerar HTML
- `questionnaire_public_controller_test.exs`:
  - Första GET sätter opened_at
  - Andra GET ändrar inte opened_at
- `demo_lookup_controller_test.exs`:
  - `find_by_demo_config` använder website_path
- `demo_generation_worker_test.exs`:
  - Sparar friendly URL som preview_url
- `followup_email_test.exs`:
  - Rendrar mall korrekt med alla fält

### Frontend-tester (100% täckning)

- `book-followup-modal.test.tsx`:
  - Renderar steg 1 med datum/tid-inputs
  - Validerar och går till steg 2
  - Visar preview (mockar fetch)
  - Skickar och stänger på success
  - Visar fel på error
- `demo-detail-tab.test.tsx`:
  - Renderar `DemoHeldContent` för demo_held-stadiet
  - Visar tracking i followup (alla statusar med timestamps)
  - Visar "—" för null-timestamps
- `demo-stage-indicator.test.tsx`:
  - Visar demo_held som fjärde steg
- `followup.test.ts` (API hooks):
  - `useBookFollowup` POSTar och invaliderar
  - `usePreviewFollowupMail` GETar

## Edge cases

- **Ingen MS-connection:** Backend returnerar 422 "No Microsoft connection", modal visar felmeddelande
- **Kund har inget mail:** Modal visar fält för att fylla i custom email
- **Dubbelt-skickat:** Endpoint är idempotent — om demo_config redan är i followup, returnera befintlig data
- **Genflow slug extraktion:** Hämta slug från GenerationJob (har redan slug-fältet), fallback `slug_from_url` om inte hittad
- **Frågeformulär redan finns:** Skapa alltid nytt för varje uppföljning (audit-trail)

## Out of scope (ej i denna leverans)

- Mail-öppet-tracking (pixel)
- Kalender-konflikt-check mot agentens Outlook
- Påminnelser för ifyllda formulär
- Admin-vy för att redigera mall
- Stöd för flera språk (bara svenska nu)
