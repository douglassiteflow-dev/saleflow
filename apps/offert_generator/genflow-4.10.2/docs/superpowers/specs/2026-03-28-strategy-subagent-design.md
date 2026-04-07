# Strategi-subagent — Aktiv resonering för tjänster och bilder

## Problem

När en kund har många tjänster (t.ex. 35-140 st) eller bilder (10+), kastar huvudagenten in allt på hemsidan utan att tänka igenom hur det ser ut. Resultatet blir:
- Överfulla tjänstesektioner som ingen scrollar igenom
- Ojämna bento grids med för många bilder
- Ingen hierarki — allt presenteras lika

## Lösning

En separat Claude-subagent som körs **före** huvudgenereringen. Den analyserar volymen av tjänster och bilder och fattar aktiva beslut om:
- Vilka tjänster som ska visas på startsidan ("featured") vs. en undersida/expand
- Vilken layout-typ varje bildsektion ska ha (single, par, grid, karusell)

Resultatet sparas som `strategy.json` och injiceras i briefen som input till huvudagenten.

## Pipeline-flöde

```
Wizard → selections.json
                ↓
        ① STRATEGI-SUBAGENT
            Läser: företagsdata.json, selections.json, imageDescriptions
            Skriver: strategy.json
                ↓
        ② HUVUDAGENT (befintlig pipeline)
            Läser: brief.md (inkl. strategy.json via $STRATEGY)
            Skriver: theme.json, prompt.md, site/index.html, [services.html]
```

## strategy.json — format

```json
{
  "reasoning": "Fri text där AI:n motiverar sina beslut — synlig för granskning",
  "services": {
    "total": 35,
    "featuredCount": 8,
    "featured": [
      {
        "namn": "Klassisk Massage Helkropp",
        "kategori": "Massage",
        "reason": "Mest populär (position 1 i bokadirekt-ordning)"
      }
    ],
    "separatePage": true,
    "pageType": "services.html",
    "categoryOrder": ["Massage", "Spabehandlingar", "Hudvård"]
  },
  "images": {
    "total": 12,
    "hero": {
      "file": "bild.jpg",
      "reason": "Bästa lokal-bilden för hero-sektion"
    },
    "sections": {
      "team": {
        "files": ["personal1.jpg"],
        "layout": "single"
      },
      "gallery": {
        "files": ["arbete1.jpg", "arbete2.jpg"],
        "layout": "carousel",
        "reason": "8 arbetsbilder — karusell undviker ojämn grid"
      },
      "about": {
        "files": ["lokal1.jpg", "lokal2.jpg"],
        "layout": "asymmetric-pair"
      }
    }
  }
}
```

### Tjänste-strategi

- **Datakälla:** Bokadirekt-ordningen = popularitetsordning. Tjänster som ligger först är mest bokade/visade.
- **Resonering:** AI:n analyserar antal tjänster, antal kategorier, och bestämmer:
  - Vilka topp-tjänster per kategori som ska visas på startsidan (featured)
  - Om resten ska visas via expand (toggle) eller separat `services.html`
  - AI bedömer baserat på volym: ~15 tjänster → expand kan räcka, 50+ → separat sida
- **`categoryOrder`:** AI:n bestämmer ordning baserat på vilka kategorier som bäst representerar verksamheten

### Bild-strategi

- **Layout-typer:**
  - `"single"` — en bild, helfält
  - `"asymmetric-pair"` — 2 bilder, olika storlek (den kreativa asymmetri som fungerar bra)
  - `"grid-even"` — 3-4 bilder i jämnt rutnät (aldrig ojämnt)
  - `"carousel"` — 5+ bilder i en slider/karusell
- **Regel:** Ojämna grids är förbjudna. Om antal bilder inte passar ett jämnt grid → karusell.
- **Per sektion:** AI:n tilldelar bilder till sektioner baserat på kategori-taggning (lokal→hero/about, personal→team, arbete→gallery, produkt→services)

## Kodändringar

### Ny fil: `pipeline/strategy-prompt.md`

Prompt som instruerar strategi-subagenten. Innehåller:
- Instruktion att läsa företagsdata, selections och bildtaggningar
- Regler för tjänste-resonering (popularitetsordning, featured-urval, undersida-beslut)
- Regler för bild-resonering (layout-typer, ojämna grids förbjudna)
- Exakt JSON-schema för output

### Ändring: `server/lib/claude-runner.js`

1. **Ny funktion `runStrategy(slug, selectedImages, filteredServices, outputDir, customer)`:**
   - Läser `strategy-prompt.md` template
   - Substituerar placeholders med tjänstedata, bildtaggningar, antal
   - Spawnar `claude --max-turns 3 --output-format json -p "..."`
   - Parsar JSON-output, skriver `output/{slug}/strategy.json`
   - Loggar i pipeline.log: "Strategisk analys startad...", "Strategisk analys klar"
   - Returnerar parsed strategy-objekt

2. **Uppdatering av `runPipeline()`:**
   - Läser `strategy.json` från output-mappen
   - Injicerar strategin som `$STRATEGY` i brief-templaten (JSON.stringify, indenterat)

### Ändring: `server/routes/generate.js`

- I `POST /`-hanteraren: anropa `await runStrategy(...)` före `runPipeline(...)`
- Logga strategifasen i SSE-strömmen

### Ändring: `pipeline/brief.md`

1. Ny sektion efter Selected Services:
   ```markdown
   ## Content Strategy
   The following strategy was produced by a pre-analysis step. Follow it EXACTLY:
   $STRATEGY
   ```

2. Steg 4 (Build Website) uppdateras med:
   ```markdown
   - Follow the content strategy EXACTLY:
     - Show ONLY the featured services on the main page
     - Use the specified layout type for each image section
     - If separatePage is true, create services.html in the same design with ALL services
     - Link to services.html with a "Se alla våra tjänster" button
     - NEVER create uneven grids — use carousel for 5+ images
   ```

### Felhantering

Om `runStrategy()` misslyckas (timeout, parse-fel, Claude-fel):
- Logga felet i pipeline.log
- Fortsätt med `runPipeline()` utan strategi — `$STRATEGY` ersätts med "Ingen strategi tillgänglig — använd eget omdöme för layout och tjänsteurval"
- Pipelinen degraderar gracefully till nuvarande beteende

### Förtydligande: pageType

- `"services.html"` — huvudagenten skapar en separat HTML-fil `site/services.html` med alla tjänster, i samma design. Startsidan har en "Se alla våra tjänster"-knapp som länkar dit.
- `"expand"` — alla tjänster finns i `index.html` men de utöver featured är dolda bakom en "Visa fler"-knapp (JavaScript toggle med smooth animation).

### Förtydligande: subagent output-parsning

`claude --output-format json` returnerar `{ "result": "...", ... }`. Strategy-JSON:en finns i `result`-fältet som en sträng. `runStrategy()` parsar: `JSON.parse(response.result)`.

### Inga UI-ändringar

Strategin körs automatiskt som del av genereringspipelinen. Säljaren ser "Strategisk analys..." i live-loggen. `strategy.json` finns tillgänglig för granskning i output-mappen.

## Output-mappstruktur (uppdaterad)

```
output/{slug}/
  företagsdata.json     ← skrapad affärsdata
  selections.json       ← användarens val
  strategy.json         ← AI-resonerad strategi (NYTT)
  brief.md              ← ifylld instruktion (nu inkl. strategi)
  theme.json            ← AI-genererat tema
  prompt.md             ← AI-genererad designprompt
  pipeline.log          ← exekveringslogg
  bilder/               ← nedladdade bilder
  site/
    index.html           ← startsidan
    services.html        ← alla tjänster (om strategin kräver det)
```
