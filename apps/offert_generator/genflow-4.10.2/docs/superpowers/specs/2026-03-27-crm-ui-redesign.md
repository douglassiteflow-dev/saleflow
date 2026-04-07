# Designspec: CRM UI Redesign — Kundhantering + Task-baserat genereringsflöde

**Datum:** 2026-03-27
**Status:** Godkänd design

## Sammanfattning

Ombyggnad av genflow UI från en enkel projektlista till ett CRM med kundhantering, task-system, logotyp-hantering, färgpalett-extraktion och bildtaggning. V1:s genereringsmotor (HTML single-file) behålls intakt — bara UI:t och briefen utökas.

---

## Datamodell

### Customer

```typescript
interface Customer {
  id: string                    // uuid
  name: string                  // Företagsnamn
  contact: string               // Kontaktperson
  phone: string
  email: string
  bokadirektUrl: string         // Anges vid bokning
  meetingDate: string           // ISO datum+tid
  slug: string                  // Från bokadirekt-URL (auto-extraherad)
  status: "booked" | "configured" | "generated" | "reviewed" | "delivered"
  createdAt: string

  // Fylls i under "Konfigurera demo"
  scrapedData: object | null    // företagsdata.json innehåll
  allImages: string[]           // Alla bilder från skrapning
  logoImage: string | null      // Filnamn på stjärnmarkerad bild
  logoTransparent: string | null // Filnamn efter remove.bg
  palette: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  } | null
  imageDescriptions: Array<{
    filename: string
    category: "lokal" | "personal" | "arbete" | "produkt"
    description: string
  }>
  selectedImages: string[]
  selectedServices: number[]
}
```

Lagras i `data/genflow.json` under `customers[]`.

---

## Task-system

Tasks härleds från `customer.status` — ingen separat datamodell.

```
Status: booked       → Task 1 aktiv: "Konfigurera demo"
Status: configured   → (generering pågår)
Status: generated    → Task 2 aktiv: "Granska resultat"
Status: reviewed     → Task 3 aktiv: "Förbered demo" (20 min innan mötet)
Status: delivered    → Alla tasks klara
```

### Task 1: Konfigurera demo

Wizard med 6 steg (en vy, stepper-bar överst):

1. **Skrapa** — Automatisk (bokadirekt-URL redan angiven). Laddningsindikator → hoppar till steg 2.
2. **Välj bilder + tjänster** — Toggle bilder on/off, checka tjänster per kategori. Samma som nuvarande v1.
3. **Markera logo** — Klicka ⭐ på en bild → POST /api/customers/:id/logo → remove.bg → transparent PNG.
4. **Justera färger** — Visa extraherad palett som color pickers. Redigerbar. PATCH /api/customers/:id.
5. **Tagga bilder** — Klicka på bild → välj kategori (lokal/personal/arbete/produkt) + fritext-beskrivning.
6. **Generera** — POST /api/generate. Terminal visar live-loggar (SSE). När klar → status="generated".

### Task 2: Granska resultat

- Iframe-preview av genererad sajt
- "Godkänn" knapp → status="reviewed"
- "Regenerera" knapp → tillbaka till steg 6

### Task 3: Förbered demo

- Aktiveras 20 minuter innan `meetingDate`
- Kundinfo-sammanfattning (namn, tjänster, kontakt)
- Direktlänk till sajt-preview
- Checklista (öppna sajten, öppna bokadirekt, etc.)

---

## UI-struktur

### Navigation: Kollapsbar sidebar

```
Expanderad:           Kollapsad:
┌──────────┐          ┌──┐
│ ⚡ Genflow│          │⚡│
│           │          │  │
│ Kunder    │          │👥│
│  Salong A │          │● │
│  Klinik B │          │● │
│  Spa C    │          │● │
│           │          │  │
│ + Ny kund │          │+ │
│           │          │  │
│ ◀ Kollapsa│          │▶ │
└──────────┘          └──┘
```

- Status-dot per kund: gul=booked, blå=configured/generated, grön=reviewed/delivered
- Klick på kund → navigerar till `/customer/:id`
- "+ Ny kund" → modal med formulär

### Header (minimal)

```
Genflow > Cute HairCut i Lund > Konfigurera demo
```

Breadcrumb bara. Inget annat.

### Sidor

| Route | Vy |
|-------|-----|
| `/` | Tom — välj kund i sidebar |
| `/customer/:id` | Kundkort + task-lista |
| `/customer/:id/configure` | Wizard (6 steg) |
| `/customer/:id/review` | Preview iframe + godkänn |
| `/customer/:id/prep` | Checklista + kundinfo |

### Kunddetalj (`/customer/:id`)

```
┌─────────────────────────────────────────┐
│ Cute HairCut i Lund                     │
│ Kontakt: Vida · 070-770 51 22           │
│ Demo: 2026-04-02 kl 14:00              │
│ Bokadirekt: bokadirekt.se/places/...    │
├─────────────────────────────────────────┤
│                                         │
│ Tasks                                   │
│                                         │
│ ✅ Konfigurera demo          [Klar]     │
│ 🔵 Granska resultat         [Öppna →]  │
│ 🔒 Förbered demo            [Låst]     │
│                                         │
└─────────────────────────────────────────┘
```

---

## Wizard: Konfigurera demo

### Stepper-bar

```
[1. Skrapa] → [2. Välj] → [3. Logo] → [4. Färger] → [5. Tagga] → [6. Generera]
   ●────────────●───────────○──────────○───────────○──────────○
```

Aktiva steg är ifyllda (●), kommande är tomma (○).

### Steg 3: Logo

```
┌─────────────────────────────────────┐
│ Välj logotyp                        │
│ Klicka ⭐ på bilden som är loggan   │
│                                     │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│ │     │ │ ⭐  │ │     │ │     │   │
│ │img1 │ │img2 │ │img3 │ │img4 │   │
│ └─────┘ └─────┘ └─────┘ └─────┘   │
│                                     │
│ ┌──────────────────────────────┐   │
│ │ Logo-preview:                │   │
│ │ [Original]  [Transparent]    │   │
│ │  (laddar remove.bg...)       │   │
│ └──────────────────────────────┘   │
│                                     │
│                    [Hoppa över] [→] │
└─────────────────────────────────────┘
```

### Steg 4: Färger

```
┌─────────────────────────────────────┐
│ Färgpalett (extraherad från loggan)  │
│                                     │
│ Primary:    [■ #4A3728] [🎨]       │
│ Secondary:  [■ #C4A882] [🎨]       │
│ Accent:     [■ #D4A0A0] [🎨]       │
│ Background: [■ #FAF6F2] [🎨]       │
│ Text:       [■ #2D2420] [🎨]       │
│                                     │
│ [🎨] = color picker                │
│                                     │
│                    [Hoppa över] [→] │
└─────────────────────────────────────┘
```

### Steg 5: Tagga bilder

```
┌─────────────────────────────────────┐
│ Beskriv bilderna                    │
│ Klicka på en bild för att tagga    │
│                                     │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│ │ ✓🏪│ │     │ │ ✓👤│ │     │   │
│ │img1 │ │img2 │ │img3 │ │img4 │   │
│ └─────┘ └─────┘ └─────┘ └─────┘   │
│                                     │
│ ┌──────────────────────────────┐   │
│ │ img1.jpg                     │   │
│ │ Kategori: [Lokal ▼]         │   │
│ │ Beskrivning: [Butikens      │   │
│ │              entré med...]  │   │
│ │                    [Spara]  │   │
│ └──────────────────────────────┘   │
│                                     │
│                    [Hoppa över] [→] │
└─────────────────────────────────────┘
```

---

## API-endpoints

### Nya

```
POST   /api/customers              — Skapa kund
GET    /api/customers              — Lista kunder
GET    /api/customers/:id          — Hämta kund
PATCH  /api/customers/:id          — Uppdatera kundfält
POST   /api/customers/:id/logo     — Remove.bg + palette-extraktion
```

### Befintliga (oförändrade)

```
POST   /api/scrape                 — Skrapa bokadirekt
POST   /api/generate               — Starta generering
GET    /api/generate/:slug/logs    — SSE live-loggar
GET    /api/generate/:slug/status  — Polla status
```

### Ändrade

```
POST   /api/generate               — Utökas: läser customer.palette,
                                     customer.imageDescriptions,
                                     customer.logoTransparent
                                     och injicerar i briefen
```

---

## Brief-utökning

`pipeline/brief.md` utökas med tre nya variabler. Bakåtkompatibelt — om variablerna är tomma fungerar briefen som förut.

```markdown
## Logo
Transparent logo: `$LOGO_URL`
Use this logo in the header/nav.

## Color Palette (extracted from logo)
Use as base palette — adjust shades but stay in this color family:
$COLOR_PALETTE

## Image Descriptions
Tagged by user — use instead of analyzing images:
$IMAGE_DESCRIPTIONS
```

`claude-runner.js` bygger variablerna:

```javascript
const palette = customer.palette
  ? Object.entries(customer.palette).map(([k,v]) => `${k}: ${v}`).join("\n")
  : "";
const imageDescs = (customer.imageDescriptions || [])
  .map(d => `- ${d.filename} [${d.category}]: ${d.description}`)
  .join("\n") || "";
const logoUrl = customer.logoTransparent
  ? `../bilder/${customer.logoTransparent}`
  : "";
```

---

## Logo-endpoint: POST /api/customers/:id/logo

```
Input:  { filename: "bild.jpg" }
                ↓
Server: 1. Läs bilden från output/{slug}/bilder/{filename}
        2. POST till https://api.remove.bg/v1.0/removebg
           (API-nyckel i env: REMOVEBG_API_KEY)
        3. Spara resultat som output/{slug}/bilder/logo-transparent.png
        4. Kör node-vibrant på transparent PNG
        5. Mappa swatches → palette
        6. Uppdatera customer: logoTransparent, palette
                ↓
Output: { logoUrl: "logo-transparent.png", palette: {...} }
```

Fallback om remove.bg misslyckas: behåll original-bilden, extrahera palette ändå.

---

## Designstil

- **Bakgrund:** Deep obsidian charcoal (#0a0a0f) med geometrisk grid-overlay i svag grå
- **Kort:** Glassmorphism — `backdrop-filter: blur(12px)`, `background: rgba(255,255,255,0.05)`, `border: 1px solid rgba(255,255,255,0.08)`
- **Accenter:** Electric violet (#7c3aed) + cyan (#06b6d4) — gradienter på interaktiva element
- **Typsnitt:** System-UI (samma som nu)
- **Animationer:** Tunga, interaktiva animationer överallt:
  - Sidebar: smooth slide in/out med spring-easing
  - Sidor: page-transition med fade + slide
  - Kort: hover-lift med shadow + scale
  - Wizard-stepper: animerad progress-bar med glow
  - Bilder: hover-zoom, klick-expand, drag-feedback
  - Color pickers: live preview-transition
  - Tasks: status-change med confetti/pulse
  - Terminal-loggar: typewriter-effekt
  - Laddning: skeleton shimmer + progress-glow
  - Modaler: backdrop-blur in + scale-spring
- **Bibliotek:** Framer Motion (motion) för alla animationer

CSS-variabler som redan finns i v1 återanvänds och utökas.

---

## Filer som ändras

### Nya filer
- `server/routes/customers.js` — CRUD + logo-endpoint
- `ui/src/pages/CustomerDetail.tsx` — Kunddetalj + tasks
- `ui/src/pages/ConfigureWizard.tsx` — 6-stegs wizard
- `ui/src/pages/ReviewResult.tsx` — Preview + godkänn
- `ui/src/pages/PrepDemo.tsx` — Checklista
- `ui/src/components/Sidebar.tsx` — Kollapsbar sidebar
- `ui/src/components/Stepper.tsx` — Wizard stepper-bar
- `ui/src/components/LogoSelector.tsx` — Stjärnmarkering + remove.bg
- `ui/src/components/PaletteEditor.tsx` — Color pickers
- `ui/src/components/ImageTagger.tsx` — Kategori + fritext per bild
- `ui/src/components/TaskList.tsx` — Task-lista med status

### Ändrade filer
- `server/index.js` — Montera `/api/customers` route
- `server/lib/store.js` — Lägg till customer-funktioner
- `server/lib/claude-runner.js` — Läs customer-data, bygg nya brief-variabler
- `server/routes/generate.js` — Läs customer för utökad brief
- `pipeline/brief.md` — Nya variabler
- `ui/src/App.tsx` — Nya routes + sidebar-layout
- `ui/src/lib/api.ts` — Nya API-funktioner
- `ui/src/index.css` — Glassmorphism + sidebar-styles
- `package.json` — Lägg till `node-vibrant`

### Oförändrade filer
- `scraper/scrape.py`
- `skills/*`
- `server/routes/scrape.js`
- `server/lib/platform.js`
- `bin/genflow.js`

---

## Implementationsordning

1. **Datamodell + API** — customers.js, store.js, generate.js utökning
2. **Brief-utökning** — brief.md + claude-runner.js
3. **Logo-endpoint** — remove.bg + node-vibrant
4. **UI Shell** — Sidebar + routing + ny App.tsx
5. **Kundformulär** — "+ Ny kund" modal
6. **Kunddetalj + Tasks** — CustomerDetail.tsx + TaskList.tsx
7. **Wizard steg 1-2** — Skrapa + välj (flytta befintlig kod)
8. **Wizard steg 3-4** — Logo + palett
9. **Wizard steg 5** — Bildtaggning
10. **Wizard steg 6** — Generering (flytta befintlig terminal)
11. **Review** — Preview + godkänn
12. **Prep Demo** — Checklista
13. **Designpolish** — Glassmorphism, animationer, responsivitet
