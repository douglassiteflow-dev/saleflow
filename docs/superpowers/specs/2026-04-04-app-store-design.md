# Appar (App Store) — Design Spec

## Sammanfattning

En intern app store där admin kan aktivera Siteflow-produkter (Genflow, Signflow, Leadflow) för sitt säljteam. Admin styr vilka agenter som får tillgång per app. Aktiverade appar visas som menyval i agentens sidebar och öppnar egna frontends inuti Saleflow.

## Admin-sida: `/admin/apps`

### Kort-grid (översikt)
- Visar alla tillgängliga Siteflow-appar som kort i en 2-3 kolumns grid
- Varje kort: ikon, namn, kort beskrivning (1 rad), status-badge (aktiverad/ej aktiverad)
- Klick på kort → detaljsida

### Detaljsida: `/admin/apps/:slug`
- Appens ikon, namn, längre beskrivning
- Screenshots/features-lista
- Aktivera/avaktivera-toggle
- Agent-tillgång: lista med alla agenter, checkbox per agent
- Bara synlig för admin

## Agent-sidebar

- Ny sektion "Appar" i sidebaren (efter Agent-sektionen, före Admin om admin)
- Visar bara appar som agenten har tillgång till
- Varje app som ett eget NavItem med appens namn (t.ex. "Genflow", "Signflow")
- Sektionen döljs helt om agenten inte har tillgång till några appar

## App-frontends

- Egna sidor under `/apps/:slug/*`
- Design matchar Saleflow (samma sidebar, topbar, design tokens)
- Varje app använder sin egen backend-tjänst som API
- Första versionen: placeholder-sida per app, fylls med riktigt innehåll senare

## Backend

### Ny tabell: `apps`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | uuid | PK |
| slug | string | Unikt, t.ex. "genflow" |
| name | string | Visningsnamn, t.ex. "Genflow" |
| description | text | Kort beskrivning för kort-grid |
| long_description | text | Längre beskrivning för detaljsida |
| icon | string | Ikon-identifierare eller URL |
| active | boolean | Om appen är aktiverad för organisationen |
| inserted_at | timestamp | |

### Ny tabell: `app_permissions`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | uuid | PK |
| app_id | uuid | FK → apps |
| user_id | uuid | FK → users |
| inserted_at | timestamp | |

Unique constraint på (app_id, user_id).

### API-endpoints

**Agent (autentiserad):**
- `GET /api/apps` — returnerar aktiverade appar som current user har tillgång till

**Admin:**
- `GET /api/admin/apps` — alla appar med status och antal agenter
- `GET /api/admin/apps/:slug` — detaljer + vilka agenter som har tillgång
- `PATCH /api/admin/apps/:slug` — aktivera/avaktivera
- `POST /api/admin/apps/:slug/permissions` — ge agent tillgång (`user_id`)
- `DELETE /api/admin/apps/:slug/permissions/:user_id` — ta bort agents tillgång

### Seed-data

Tre appar seedas vid setup:
- **Genflow** — slug: `genflow`, beskrivning: "Generera professionella hemsidor för dina kunder"
- **Signflow** — slug: `signflow`, beskrivning: "Skapa offerter och avtal, skicka för signering"
- **Leadflow** — slug: `leadflow`, beskrivning: "Scrapa och importera leads automatiskt"

## Routing

```
/admin/apps          → AdminAppsPage (kort-grid)
/admin/apps/:slug    → AdminAppDetailPage (detalj + permissions)
/apps/genflow/*      → GenflowApp (egen frontend)
/apps/signflow/*     → SignflowApp (egen frontend)
/apps/leadflow/*     → LeadflowApp (egen frontend)
```

## Tester

- Backend: CRUD-endpoints, permissions, agent ser bara sina appar
- Frontend: admin-sida renderar kort, detaljsida funkar, sidebar visar appar
