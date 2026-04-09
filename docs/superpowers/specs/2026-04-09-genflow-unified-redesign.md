# Genflow Unified Redesign — Design Spec

## Översikt

Bygg om Genflow från grunden till en unified Electron-desktop-app som kombinerar det som idag är spritt över fem halvfärdiga kopior på disk. Den nya appen fungerar som en **lokal processing-nod för Saleflow-backenden** — när den körs på Douglas's Mac, plockar den automatiskt upp genererings-jobb från backend, kör hela pipelinen lokalt (scraper → strategy → layout → parallel sidor → polish → bildverifiering → deploy), och postar resultatet tillbaka till backend.

### Mål

1. **Unified projekt**: ETT git-repo, ETT package, EN Electron-app. Inga separata server-processer som pratar via HTTP.
2. **Monorepo**: Lever i `saleflow/apps/genflow/` (inte submodule, inte separat repo).
3. **Auto-start + bakgrundsläge**: Startar vid Mac-login, lever som menybar-app med dold dock, main window öppnas vid behov.
4. **Multi-page CMS-pipeline**: Flera sidor som delar tema/header/footer/nav, parallell generering, stock-bilder bara, bento-galleri, kombinerat polish-pass.
5. **Defensiv Claude-hantering**: Max 3 parallella Claude-processer, p-limit + watchdog + hang-detection, inga timeouts i polling-workern.
6. **Radera allt gammalt**: 5 kopior av genflow/flowing-ai på disk raderas efter migration.

### Bakgrund — vad som finns idag

| # | Plats | Senast ändrad | Status |
|---|---|---|---|
| 1 | `~/dev/flowing-ai/` | 2026-04-01 | Git repo, full stack (scraper + skills + server + pipeline), snapshot från genflow v4.10.2 |
| 2 | `~/dev/flowing-ai-main/` | 2026-04-03 | Ej git repo, multi-brief-filer (`brief-page.md`, `brief-design-system.md`), saknar scraper/skills |
| 3 | `~/dev/genflow/` | 2026-04-01 | Git repo, full stack, Claude Code retry/token-patterns porterade |
| 4 | `apps/offert_generator/genflow-4.10.2/` | 2026-04-08 | Ej git repo, bara bin/ + docs/ + node_modules — installerad som dep, ingen utvecklingskod |
| 5 | `apps/genflow-local-server/` | aktuell | Electron + React + Vite stack (den mest moderna), polling-worker, men ingen inbyggd pipeline |

Och i backend (som KÖRS idag via `use_genflow_jobs=false` default):
- `backend/lib/saleflow/workers/demo_generation_worker.ex` → `run_locally()` spawnar Claude CLI direkt från Elixir med `backend/priv/demo_generation/brief.md`
- `run_via_genflow()` finns men är avstängd (den path som denna spec aktiverar)

### Fynd från research (2025-2026 best practices)

Research från Electron-docs, communityn och relevanta github-issues gav dessa konkreta fynd:

1. **`utilityProcess.fork()`** (Electron 22+) är det rekommenderade sättet att isolera background-logik från main process. Den ger automatic lifecycle, MessagePort IPC, och dödas automatiskt med appen. Detta ersätter `child_process.fork()`-mönstret från 2020.
2. **Vite 6 + vite-plugin-electron + electron-builder + React 19** är exakt den stack som `apps/genflow-local-server/` redan kör — ingen migration behövs på toolchain-sidan.
3. **`pnpm workspaces`** istället för git submodules för "paket i monorepo". Submodules är bräckligare och git submodule update är en vanlig källa till DX-friktion.
4. **Claude CLI har dokumenterade parallelism-buggar** (issues #18666, #15945, #21399, #38258). Max 3-5 parallella processer med `p-limit` + watchdog är säkrare än 10.
5. **PyInstaller sidecar** är standard-mönstret för att bundla Python i Electron-appar (se Datasette Desktop, JupyterLab Desktop).
6. **SMAppService via `app.setLoginItemSettings({ type: 'mainAppService', args: ['--hidden'] })`** för auto-start på macOS 13+. Tray-ikon + hide-to-tray via `window-all-closed`-preventDefault är standardmönstret.
7. **Menubar-pattern** via `max-mapper/menubar` eller egen Tray-implementation — apps som Rectangle, Stats, iStat Menus, Linear Desktop använder samma pattern.

---

## Projekt-arkitektur

### Katalog-struktur (ny)

```
saleflow/                              (monorepo, som idag)
├── apps/
│   ├── genflow/                       ← NY (ersätter genflow-local-server/)
│   │   ├── electron/
│   │   │   ├── main.ts                ← Electron main + tray + login item
│   │   │   ├── preload.ts             ← Context bridge
│   │   │   └── server-worker.ts       ← utilityProcess entry point
│   │   ├── ui/                        ← Renderer process (React)
│   │   │   ├── src/
│   │   │   │   ├── App.tsx            ← status + logg-panel + config + jobbkö
│   │   │   │   ├── main.tsx
│   │   │   │   └── components/
│   │   │   ├── vite.config.ts
│   │   │   └── index.html
│   │   ├── server/                    ← Intern backend (utility process)
│   │   │   ├── index.ts               ← startpunkt för utilityProcess
│   │   │   ├── poller.ts              ← Saleflow polling loop (från worker.ts)
│   │   │   ├── orchestrator.ts        ← kör pipeline per jobb
│   │   │   ├── claude-runner.ts       ← spawnar claude CLI med p-limit + watchdog
│   │   │   ├── image-verifier.ts      ← Node HEAD-check mot Unsplash
│   │   │   └── lib/
│   │   │       ├── platform.ts        ← paths till claude-binär, scraper-binär
│   │   │       ├── layout-substitution.ts  ← Node template replacement
│   │   │       └── logger.ts          ← rad-strukturerad log med heartbeat
│   │   ├── pipeline/                  ← Prompt-templates (flat, versionerade)
│   │   │   ├── strategy-prompt.md
│   │   │   ├── layout-prompt.md
│   │   │   ├── page-prompt.md
│   │   │   └── unsplash-allowlist.json
│   │   ├── scraper/
│   │   │   ├── scrape.py              ← bokadirekt scraper (utan bildnedladdning)
│   │   │   └── requirements.txt
│   │   ├── skills/                    ← Claude Code skills (add-dir vid spawn)
│   │   │   ├── frontend-design/
│   │   │   ├── theme-factory/
│   │   │   ├── prompt-generator/
│   │   │   └── web-artifacts-builder/
│   │   ├── bin/                       ← gitignored, fylls av build-script
│   │   │   └── darwin-arm64/
│   │   │       └── scrape             ← PyInstaller-binär
│   │   ├── scripts/
│   │   │   └── build-scraper.sh       ← pyinstaller wrapper
│   │   ├── output/                    ← gitignored, jobb-artefakter
│   │   ├── resources/
│   │   │   ├── tray-icon.png          ← menybar-ikon (16x16 + 32x32 @2x)
│   │   │   └── app-icon.icns
│   │   ├── package.json               ← en enda package.json för hela appen
│   │   ├── tsconfig.json
│   │   ├── electron-builder.yml
│   │   └── README.md
│   ├── genflow-local-server/          ← RADERAS
│   └── offert_generator/
│       └── genflow-4.10.2/            ← RADERAS
├── packages/                          ← NY (tom för nu, för framtida delade typer)
├── pnpm-workspace.yaml                ← NY (om inte redan existerar)
└── ...
```

**Noter:**
- `ui/` har sin egen `vite.config.ts` som bygger React-rendereren. `electron/` byggs separat (antingen av `vite-plugin-electron` eller via ett separat esbuild-steg — vi behåller nuvarande pattern från genflow-local-server).
- `bin/` är gitignored och fylls av `scripts/build-scraper.sh` innan electron-builder packar. I dev-mode spawnar vi `python3 scraper/scrape.py` istället.
- `skills/` committas som är. De är promptfragment som Claude läser via `--add-dir`.
- `output/` är gitignored men skapas dynamiskt av orchestrator:n när ett jobb körs.

### Processmodell (utilityProcess-pattern)

```
Electron main process (electron/main.ts)
    │
    ├── Owns BrowserWindow (React UI renderer)
    ├── Owns Tray (menybar-ikon)
    ├── Owns login item via app.setLoginItemSettings
    ├── Spawns ONE utility process för backend
    │
    └──→ utilityProcess (electron/server-worker.ts → server/index.ts)
              │
              ├── Startar Saleflow-pollern (server/poller.ts)
              ├── Kör orchestrator.ts när jobb plockas
              ├── Spawnar Claude CLI subprocesser (p-limit=3)
              ├── Spawnar Python scraper som child_process
              ├── Läser/skriver output/ katalog
              └── Postar tillbaka via MessageChannel till main
```

**Viktiga egenskaper:**
- Utility process kraschar → main process loggar, restartar utility process efter 5 sek backoff
- Main process stängs → utility process dödas automatiskt av Electron (native lifecycle)
- `app.on('before-quit')` skickar `shutdown`-meddelande via MessagePort, väntar 5 sek på clean exit, sen SIGKILL
- IPC-kanal mellan main och utility: events för status, loggar, fel
- IPC-kanal mellan main och renderer: status-updates relay:as via main (utility pratar aldrig direkt med renderer)

### Menybar-hybrid lifecycle

Appen beter sig som en "accessory app" (tray-only när stängd, main window på begäran):

- **Kallstart via Applications folder**: Visa main window + tray-ikon + fylld dock
- **Kallstart via login item (med `--hidden`)**: Bara tray-ikon, ingen dock, ingen main window
- **User stänger main window**: `preventDefault` på `window-all-closed`, dölj dock via `app.dock.hide()`, behåll tray
- **User klickar tray-ikon**: Öppna main window (skapa om det inte finns), visa dock
- **User väljer "Quit" från tray-meny**: Kalla `app.quit()` → triggar `before-quit` → skickar shutdown till utility → väntar 5 sek → dödar kvarstående processer → exit

### Auto-start via SMAppService

```ts
// electron/main.ts (vid whenReady)
app.setLoginItemSettings({
  openAtLogin: true,
  type: 'mainAppService',
  args: ['--hidden'],
})
```

**Krav:**
- Appen måste vara signed + notarized för att SMAppService ska fungera i release. I dev-mode fungerar det oftast men är inte garanterat.
- Testas genom att: slå av, logga ut, logga in → verifiera att tray-ikon dyker upp automatiskt utan main window.

### Tray-meny

```
Genflow (status: ● Ansluten)
─────────────
Visa fönster
Pausa polling
─────────────
Senaste jobb:
  ✓ salong-x (klar)
  ⏳ klinik-y (genererar)
─────────────
Quit
```

Trayens ikon-tooltip visar status: "Ansluten" (grön prick), "Frånkopplad" (röd), "Pausad" (gul).

---

## Pipeline-logiken (multi-page CMS)

Detta är pipeline-designen som tidigare dokumenterats i en separat spec (`2026-04-09-genflow-cms-multipage-design.md`). Den specen raderas och ersätts av denna sektion. Filsökvägarna är uppdaterade till den nya `apps/genflow/`-strukturen.

### Pipeline-flöde

```
scrape (quick-mode, utan bildnedladdning)
  ↓
strategy pass (sekventiellt)
  ↓
layout pass (sekventiellt) — producerar layout.html
  ↓
┌─ pipeline(index)    → polish(index)    ─┐
├─ pipeline(tjanster) → polish(tjanster) ─┤  parallellt per sida
├─ pipeline(om-oss)   → polish(om-oss)   ─┤  (MAX 3 samtidiga via p-limit)
├─ pipeline(galleri)  → polish(galleri)  ─┤
└─ pipeline(kontakt)  → polish(kontakt)  ─┘
  ↓
bildverifiering (Node HEAD-requests, ingen Claude)
  ↓
deploy (Vercel)
  ↓
POST result_url tillbaka till Saleflow
```

### Artefakter per jobb

```
apps/genflow/output/{slug}/
├── företagsdata.json           — scrape output, utan bildnedladdning
├── strategy.json               — sidval + sektion-beslut per sida + galleri-teman
├── layout.html                 — delad mall (theme + head + header + footer + nav)
├── pipeline.log                — live logg (heartbeat för hang-detection)
├── pages/                      — temp-katalog med content-fragment per sida
│   ├── index.content.html
│   ├── tjanster.content.html
│   └── ...
└── site/                       — slutresultat efter Node-substitution + polish
    ├── index.html              — alltid
    ├── tjanster.html           — om strategen valde den
    ├── om-oss.html             — om strategen valde den
    ├── galleri.html            — om strategen valde den
    └── kontakt.html            — om strategen valde den
```

Observera att `bilder/`-katalogen **inte** finns — vi laddar inte ner kundbilder. Alla bilder är Unsplash stock-URL:er. Ingen `brief.md`, `theme.json`, `prompt.md`, `recensioner.json`, `selections.json`, `cost.json` skapas.

### Strategy pass

**Fil:** `apps/genflow/pipeline/strategy-prompt.md`

Strategen bestämmer vilka sidor som ska skapas, hur tjänster fördelas mellan sidor, och vilka Unsplash-söktermar som ska användas för galleri/hero-bilder. Den får hela `företagsdata.json` som input — INGET urval sker i kod. Alla tjänster matas in, strategen väljer bara presentationen.

**Prompt-innehåll:**

```markdown
# Innehållsstrategi för flersidig webbplats

Du är innehållsstrategist för en webbyrå. Analysera företagsdatan nedan och bestäm:
1. Vilka sidor som behövs (från en fast kandidatlista)
2. Vilka tjänster som ska vara featured på index
3. Hur recensioner ska visas
4. Om galleri behövs och vilka Unsplash-teman som passar

## Företagsdata

$BUSINESS_DATA

## Tillgängliga sidtyper (fast lista)

- `index` — alltid obligatorisk
- `tjanster` — lämplig när >15 tjänster eller >4 kategorier
- `om-oss` — lämplig när om_oss-text >200 tecken eller ≥3 personal finns
- `galleri` — lämplig när affärstypen gynnas av visuellt innehåll (salong, spa, nagel, massage, skönhet, klinik)
- `kontakt` — lämplig när minst 2 av följande finns: adress, telefon, öppettider, karta

## Minimum-regel

Om INGA kandidater triggas — skippa alla undersidor. Allt packas in på `index.html` (tjänster som "visa fler"-toggle, om-oss som sektion, kontakt i footer).

## Recensions-regler

- ≤3 recensioner → statiska kort på index
- >3 recensioner → horisontell infinity-scroll på index (ALDRIG på en separat recensioner-sida)

## Galleri-regler

- Galleri visas ALLTID som bento-grid (varierade cell-storlekar) — ALDRIG infinity-scroll eller carousel
- När du väljer galleri: ge 3-5 konkreta Unsplash-söktermar baserat på affärstypen

## Ingen team-sida

Personal nämns som text i `om-oss` eller i footern — ingen dedikerad team-sektion med porträtt.

## Output

Respondera med ENDAST valid JSON, inget annat:

\`\`\`json
{
  "reasoning": "2-4 meningar motivering",
  "businessType": "frisör | spa | nagel | massage | skönhet | klinik | annat",
  "pages": [
    {
      "slug": "index",
      "filename": "index.html",
      "sections": ["hero", "intro", "featured-tjanster", "recensioner", "kontakt-cta"],
      "reason": "Huvudsida"
    }
  ],
  "services": {
    "total": 0,
    "featuredForIndex": [{"namn": "...", "kategori": "...", "reason": "..."}],
    "categoryOrder": ["..."]
  },
  "reviews": {
    "total": 0,
    "displayMode": "statiska-kort | infinity-scroll | skippa",
    "placement": "index"
  },
  "gallery": {
    "needed": true,
    "layout": "bento",
    "placement": "galleri",
    "themes": ["modern salong interiör", "hår styling närbild"]
  }
}
\`\`\`
```

**Variabelsubstitution i `claude-runner.ts` → `runStrategy()`:**
- `$BUSINESS_DATA` = första 3000 tecken av `företagsdata.json`

**Körning:**
```ts
spawn(CLAUDE_BIN, [
  '--dangerously-skip-permissions',
  '--bare',
  '-p', prompt,
  '--output-format', 'json',
  '--max-turns', '5',
], { cwd: outputDir })
```

Körs inom `p-limit` semaphoren som alla Claude-spawns. Parseras som JSON, sparas som `strategy.json`.

### Layout pass (NYTT)

**Fil:** `apps/genflow/pipeline/layout-prompt.md`

Producerar EN delad HTML-mall (`layout.html`) med `<head>`, `<style>` (all CSS), `<header>`, `<nav>`, `<footer>` och en `<main><!-- CONTENT --></main>`-platshållare. Alla sidor fylls sedan i från denna mall via Node-substitution (inte Claude).

**Prompt-innehåll (förkortat — full version i implementation):**

```markdown
# Layout-mall för flersidig webbplats

Du är webbdesigner. Producera EN enda fil — `layout.html` — som fungerar som delad mall för alla sidor.

## Företagsdata
$BUSINESS_DATA

## Affärstyp
$BUSINESS_TYPE

## Sidor som kommer skapas
$PAGES_LIST

Navbaren MÅSTE innehålla länkar till exakt dessa sidor.

## Krav på layout.html

1. Komplett <!DOCTYPE html> (lang="sv")
2. <head> med:
   - <title>{{PAGE_TITLE}}</title>  (platshållare — oförändrad)
   - <meta name="description" content="{{PAGE_DESCRIPTION}}">
   - Google Fonts (välj 1-2 fonter baserat på affärstypen)
   - En enda <style>-block med ALL CSS för webbplatsen:
     * CSS custom properties (--primary, --secondary, --accent, --text, --bg, --surface)
     * Reset, base, typografi
     * Komponenter: header, nav, footer, knappar, kort, hero, bento-grid, recensions-scroll, kontaktformulär
     * Responsiv navbar med hamburger på mobil
3. <header> med logo + <nav> där varje <a> har data-page="<slug>"-attribut
4. <main><!-- CONTENT --></main> — EXAKT denna kommentar
5. <footer> med kontaktinfo, öppettider, länkar till alla sidor

## Färgpalett per affärstyp

- frisör/skönhet: varma pasteller, koppar, champagne
- spa: lugna jordnära toner, sage, terracotta
- nagel: mjukt rosa, nude, accentfärg
- massage: neutrala jordnära, mörkt trä
- klinik: rent vitt, ljusblått, mint
- annat: välj baserat på företagsnamn och beskrivning

## Typografi

Två Google Fonts: en för rubriker, en för brödtext.

## FÖRBJUDET

- <main> får INTE innehålla något annat än <!-- CONTENT -->
- Inga placeholder-texter som "Lorem ipsum"
- Inga externa CSS-filer utöver Google Fonts

## Leverans

Spara till $OUTPUT_DIR/layout.html. Inga andra filer.
```

**Variabelsubstitution i `runLayout()`:**
- `$BUSINESS_DATA` = första 2000 tecken av `företagsdata.json`
- `$BUSINESS_TYPE` = `strategy.businessType`
- `$PAGES_LIST` = markdown-lista från `strategy.pages[]`:
  ```
  - index (index.html)
  - tjanster (tjanster.html)
  ```

**Verifiering efter layout-passet:**
1. `layout.html` finns
2. Exakt ett `<!-- CONTENT -->`
3. Innehåller `{{PAGE_TITLE}}` och `{{PAGE_DESCRIPTION}}`
4. Har `<style>`-block i `<head>`
5. Har `<nav>` med `<a data-page="<slug>">` för varje sida i `strategy.pages[]`

Om verifiering failar → retry 1 gång. Om även andra försöket failar → hela jobbet failar.

### Per-sidig pipeline pass

**Fil:** `apps/genflow/pipeline/page-prompt.md`

**Viktigt arkitekturbeslut:** Claude producerar BARA content-fragmentet som ska in i `<main>`. Claude rör aldrig själva `layout.html`. Node-koden gör deterministisk substitution (layout + content → slutlig sidfil). Detta eliminerar all risk för att Claude av misstag ändrar `<head>`, `<header>` eller `<footer>`.

### Flöde per sida

1. Claude läser `layout.html` (read-only, för att se CSS-klasser och tema)
2. Claude genererar content-HTML och skriver till `apps/genflow/output/{slug}/pages/{page-slug}.content.html`
3. Node läser `layout.html` + content-filen
4. Node gör substitution:
   - `{{PAGE_TITLE}}` → sid-titel (genererad i kod baserat på slug)
   - `{{PAGE_DESCRIPTION}}` → meta-beskrivning (genererad i kod)
   - Lägger till `class="active"` på `<a data-page="$PAGE_SLUG">`
   - `<!-- CONTENT -->` → content-fragmentet
5. Node skriver resultatet till `apps/genflow/output/{slug}/site/{filename}`

### Prompt-mall

```markdown
# Sid-innehåll: $PAGE_SLUG

Du bygger INNEHÅLLET för sidan $PAGE_FILENAME. Den delade mallen finns i $LAYOUT_PATH. Din uppgift är BARA att producera content-fragmentet som ska sättas in i <main>. Du får INTE redigera layout-filen och INTE skriva den slutliga sidfilen — Node sköter substitutionen.

## Företagsdata
$BUSINESS_DATA

## Strategi
$STRATEGY

## Sidspecifika data
$PAGE_CONTEXT

## Process

1. Läs $LAYOUT_PATH (Read med limit 1000) för att förstå CSS-klasser, tema, komponenter
2. Generera HTML för sektionerna: $PAGE_SECTIONS
3. Skriv ENDAST content-fragmentet till: $CONTENT_PATH
   - Bara sektioner som ska visas inuti <main>
   - Inget <html>, <head>, <body>, <header>, <footer>, <main>-omslag

## Regler

- Bilder är Unsplash-URL:er: https://images.unsplash.com/photo-XXXX?w=1200&q=80
- Ingen <style>-tagg normalt — CSS finns i layouten. Sidspecifik CSS får finnas som litet <style>-block överst i fragmentet.
- Inget <script>
- CSS-klasser ska matcha layoutens <style>
- Svenska text genomgående
- Aldrig skriva till site/
- Aldrig läsa/ändra andra filer än $LAYOUT_PATH (read) och $CONTENT_PATH (write)

## Sidtyp-specifika regler

$PAGE_TYPE_RULES
```

### Per-sidtyp-regler (`$PAGE_TYPE_RULES`)

**`index`:**
```
- Hero med företagsnamn, tagline, primär CTA, Unsplash-bakgrundsbild
- Kort intro (2-3 meningar)
- Featured tjänster-grid (bara strategy.services.featuredForIndex)
- Om strategy.reviews.displayMode === "infinity-scroll": horisontell auto-scroll, duplicerade kort, pause on hover, 5-8 recensioner
- Om strategy.reviews.displayMode === "statiska-kort": 3 kort i grid
- Kontakt-CTA-sektion med adress, telefon, knapp till kontakt.html
```

**`tjanster`:**
```
- Rubriksektion "Våra tjänster"
- Grupperade per kategori i strategy.services.categoryOrder
- Varje tjänst: namn, beskrivning, pris, varaktighet
- ALLA tjänster från företagsdata.json
- Strukturerad layout (inte kort med bakgrundsbilder)
```

**`om-oss`:**
```
- Hero med kort beskrivning
- Historia/värderingar från om_oss-text
- Personal som TEXT (ingen team-grid)
- Eventuell Unsplash-bild av lokaltyp
```

**`galleri`:**
```
- Bento-grid layout (variarade cell-storlekar)
- 8-12 Unsplash-bilder från strategy.gallery.themes
- ALDRIG infinity-scroll eller carousel
- Hover-effekter tillåtna
```

**`kontakt`:**
```
- Kontaktformulär (rent visuellt, action="#")
- Adress, telefon, email
- Öppettider som tabell
- Google Maps iframe om adress finns
```

### Variabelsubstitution i `runPagePipeline()`

- `$PAGE_SLUG` = `pageSpec.slug`
- `$PAGE_FILENAME` = `pageSpec.filename`
- `$PAGE_SECTIONS` = `JSON.stringify(pageSpec.sections)`
- `$PAGE_CONTEXT` = olika per sidtyp:
  - `index`: featured services + reviews.slice(0, 8) + recensionsmode
  - `tjanster`: alla services med `categoryOrder`
  - `om-oss`: `om_oss`-text + personal-namn som text
  - `galleri`: `strategy.gallery.themes`
  - `kontakt`: adress, telefon, email, öppettider
- `$PAGE_TYPE_RULES` = strängen ovan per sidtyp
- `$BUSINESS_DATA` = första 2000 tecken av `företagsdata.json`
- `$STRATEGY` = hela `strategy.json`
- `$LAYOUT_PATH` = absolut path till `layout.html`
- `$CONTENT_PATH` = absolut path till `output/{slug}/pages/{page-slug}.content.html`

### Node-substitution (`server/lib/layout-substitution.ts`)

```ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function renderPageFromLayout(
  pageSpec: PageSpec,
  strategy: Strategy,
  outputDir: string
): void {
  const contentPath = join(outputDir, 'pages', `${pageSpec.slug}.content.html`)
  const layoutPath = join(outputDir, 'layout.html')
  const sitePath = join(outputDir, 'site', pageSpec.filename)

  if (!existsSync(contentPath)) {
    throw new Error(`Content-fragment saknas: ${contentPath}`)
  }

  const content = readFileSync(contentPath, 'utf-8')
  const layout = readFileSync(layoutPath, 'utf-8')
  const businessName = readBusinessName(outputDir)
  const pageTitle = buildPageTitle(pageSpec.slug, businessName)
  const pageDescription = buildPageDescription(pageSpec.slug, businessName)

  let html = layout
    .replace('{{PAGE_TITLE}}', escapeHtml(pageTitle))
    .replace('{{PAGE_DESCRIPTION}}', escapeHtml(pageDescription))
    .replace('<!-- CONTENT -->', content)

  // Sätt active-klass på nav-länk för denna sida
  const activeRe = new RegExp(
    `(<a[^>]*data-page=["']${pageSpec.slug}["'][^>]*?)(class=["']([^"']*)["'])?`
  )
  html = html.replace(activeRe, (match, prefix, classAttr, classes) => {
    if (classAttr) {
      return `${prefix}class="${classes} active"`
    }
    return `${prefix} class="active"`
  })

  writeFileSync(sitePath, html)
}

function buildPageTitle(slug: string, businessName: string): string {
  const titles: Record<string, string> = {
    index: businessName,
    tjanster: `Tjänster — ${businessName}`,
    'om-oss': `Om oss — ${businessName}`,
    galleri: `Galleri — ${businessName}`,
    kontakt: `Kontakt — ${businessName}`,
  }
  return titles[slug] ?? businessName
}

function buildPageDescription(slug: string, businessName: string): string {
  const descriptions: Record<string, string> = {
    index: `Välkommen till ${businessName}. Boka tid online.`,
    tjanster: `Alla tjänster och priser hos ${businessName}.`,
    'om-oss': `Läs mer om ${businessName} — vår historia och värderingar.`,
    galleri: `Bildgalleri från ${businessName}.`,
    kontakt: `Kontakta ${businessName} — adress, telefon och öppettider.`,
  }
  return descriptions[slug] ?? businessName
}
```

### Parallell orkestrering

I `server/orchestrator.ts`:

```ts
import pLimit from 'p-limit'

const CLAUDE_CONCURRENCY = 3

export async function runJob(job: GenJob, outputDir: string, log: LogFn) {
  await runScrape(job.source_url, outputDir, log)
  const strategy = await runStrategy(outputDir, log)
  await runLayout(strategy, outputDir, log)

  const limit = pLimit(CLAUDE_CONCURRENCY)
  const results = await Promise.all(
    strategy.pages.map(page =>
      limit(async () => {
        try {
          await runPagePipeline(page, strategy, outputDir, log)
          renderPageFromLayout(page, strategy, outputDir)
          await runPolish(page, outputDir, log)
          return { slug: page.slug, ok: true }
        } catch (err) {
          log(`Sida ${page.slug} misslyckades: ${err.message}`)
          return { slug: page.slug, ok: false }
        }
      })
    )
  )

  const failed = results.filter(r => !r.ok).map(r => r.slug)
  if (failed.includes('index')) {
    throw new Error('Index-sidan misslyckades — hela jobbet failar')
  }
  if (failed.length > 0) {
    log(`Misslyckade sidor: ${failed.join(', ')}`)
    await removeDeadNavLinks(outputDir, failed)
  }

  await verifyAllImages(outputDir, strategy.businessType, log)
  const resultUrl = await deployToVercel(outputDir, log)
  return resultUrl
}
```

**`pLimit(3)`** säkerställer max 3 samtidiga Claude-processer per jobb — inte bara för pipeline-passen utan för ALLA Claude-anrop inom jobbet (strategy + layout + pipeline + polish). Det är hårt tak oavsett antal sidor.

### Polish pass

Kombinerar review + creative till ETT pass per sida. Körs efter att Node-substitutionen producerat sid-filen. Polish-prompten får BARA ändra innehåll mellan `<main>` och `</main>` — allt annat är låst.

**Inline-prompt i `server/claude-runner.ts`:**

```
Du är senior webbutvecklare och kreativ designer. Du granskar OCH förbättrar sidan `$PAGE_FILENAME`. Layout-mallen har redan genererats och är ansvarig för tema, header, footer och <style>-blocket. Din uppgift är att polera <main>-innehållet.

Företag: $BUSINESS_NAME
Affärstyp: $BUSINESS_TYPE
Sida: $PAGE_SLUG

## STEG 1: Läs filen på EN GÅNG (Read med limit 1000)

## STEG 2: Granska <main>-innehållet

Leta efter:
- Ojämna grids, dålig spacing, överlappande element
- Inkonsekvent typografi
- Dålig kontrast
- Tomma sektioner, placeholder-text
- Brutna Unsplash-URL:er
- Två infinity-scroll-sektioner direkt efter varandra

## STEG 3: Förbättra — lägg till 2-4 av följande

- Hero parallax (OBLIGATORISKT på index.html om sidan har hero)
- Fade-in-on-scroll-animationer
- Hover-effekter på kort och knappar
- Gradient overlays på hero-bilder
- Glassmorphism på kort (backdrop-filter: blur)
- SVG wave-dividers
- Subtila accent-linjer

## REGLER — STRIKT

- Du får BARA redigera innehåll mellan <main> och </main>
- FÖRBJUDET att ändra <head>, <header>, <footer>, <style>
- Sidspecifik CSS → <style>-block DIREKT efter <main>-öppningen, INUTI <main>
- Ändra INTE företagsnamn, tjänster, priser, kontaktinfo
- Ändra INTE nav-länkar eller data-page-attribut
- Ändra INTE active-state-klassen
- ALL text på svenska

## Beskriv kort på svenska vad du fixade
```

**Verifiering efter polish:**
- Filen finns
- `<!-- CONTENT -->` finns INTE kvar
- `<head>` är identiskt med layout.html (normalize + jämför)
- `<nav>` har fortfarande alla `data-page`-attribut

Om verifiering failar → logga warning men fortsätt. Polish-fel är inte dödsstöt.

### Bildverifiering (Node, ingen Claude)

**Fil:** `apps/genflow/server/image-verifier.ts`

Efter alla sidor är polerade — hitta trasiga Unsplash-URL:er via HEAD-request och byt ut mot allow-list-URL:er.

```ts
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const UNSPLASH_RE = /https:\/\/images\.unsplash\.com\/[^\s"')]+/g

export async function verifyAllImages(
  outputDir: string,
  businessType: string,
  log: LogFn
) {
  const siteDir = join(outputDir, 'site')
  const allowlistPath = join(__dirname, '..', 'pipeline', 'unsplash-allowlist.json')
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf-8'))
  const fallbacks: string[] = allowlist[businessType] ?? allowlist.default

  const htmlFiles = readdirSync(siteDir).filter(f => f.endsWith('.html'))

  for (const file of htmlFiles) {
    const path = join(siteDir, file)
    let html = readFileSync(path, 'utf-8')
    const urls = [...new Set(html.match(UNSPLASH_RE) ?? [])]

    let fallbackIndex = 0
    for (const url of urls) {
      if (!(await isReachable(url))) {
        const fallback = fallbacks[fallbackIndex % fallbacks.length]
        fallbackIndex++
        log(`Ersätter trasig bild i ${file}: ${url.slice(0, 60)}...`)
        html = html.split(url).join(fallback)
      }
    }
    writeFileSync(path, html)
  }
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}
```

**`apps/genflow/pipeline/unsplash-allowlist.json`:**

```json
{
  "frisör": [
    "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=80",
    "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1200&q=80"
  ],
  "spa": [
    "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200&q=80",
    "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1200&q=80"
  ],
  "nagel": [
    "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200&q=80"
  ],
  "massage": [
    "https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=1200&q=80"
  ],
  "skönhet": [
    "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200&q=80"
  ],
  "klinik": [
    "https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=1200&q=80"
  ],
  "annat": [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"
  ],
  "default": [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"
  ]
}
```

Allow-list börjar med 1-3 URL:er per affärstyp och växer över tid. Varje URL validerades manuellt via `curl -I` innan commit.

---

## Claude CLI spawning — defensivt

Research visade dokumenterade parallelism-buggar i claude CLI (issues #18666, #15945, #21399, #38258). Vi designar defensivt.

### `claude-runner.ts` pattern

```ts
import { spawn, ChildProcess } from 'node:child_process'
import pLimit from 'p-limit'

const CLAUDE_CONCURRENCY = 3
const CLAUDE_MAX_RUNTIME_MS = 45 * 60 * 1000  // 45 min hard timeout per process
const STDOUT_IDLE_MS = 120 * 1000              // 2 min utan stdout = hang

const limit = pLimit(CLAUDE_CONCURRENCY)
const activeProcesses = new Set<ChildProcess>()

export function runClaude(args: string[], cwd: string, onLogLine: (line: string) => void) {
  return limit(() => new Promise<string>((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    activeProcesses.add(proc)

    let stdout = ''
    let lastActivity = Date.now()

    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > STDOUT_IDLE_MS) {
        onLogLine(`Claude tyst i ${STDOUT_IDLE_MS / 1000}s — skickar SIGTERM`)
        proc.kill('SIGTERM')
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL')
        }, 3000)
      }
    }, 10_000)

    const hardTimer = setTimeout(() => {
      onLogLine(`Claude max runtime ${CLAUDE_MAX_RUNTIME_MS / 1000}s — dödar`)
      proc.kill('SIGKILL')
      reject(new Error('claude max runtime'))
    }, CLAUDE_MAX_RUNTIME_MS)

    proc.stdout?.on('data', chunk => {
      lastActivity = Date.now()
      stdout += chunk.toString()
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) onLogLine(line.slice(0, 200))
      }
    })

    proc.stderr?.on('data', chunk => {
      lastActivity = Date.now()  // stderr räknas också som aktivitet
      onLogLine(`[stderr] ${chunk.toString().slice(0, 200)}`)
    })

    proc.on('error', err => {
      clearInterval(watchdog)
      clearTimeout(hardTimer)
      activeProcesses.delete(proc)
      reject(err)
    })

    proc.on('exit', code => {
      clearInterval(watchdog)
      clearTimeout(hardTimer)
      activeProcesses.delete(proc)
      if (code === 0) resolve(stdout)
      else reject(new Error(`claude exit code ${code}`))
    })
  }))
}

export function killAllActive() {
  for (const proc of activeProcesses) {
    proc.kill('SIGKILL')
  }
  activeProcesses.clear()
}
```

### Shutdown-hook i utility process

```ts
// server/index.ts
import { killAllActive } from './claude-runner'

process.parentPort?.on('message', e => {
  if (e.data?.type === 'shutdown') {
    killAllActive()
    process.exit(0)
  }
})
```

### Huvudsakliga försvarslinjer

1. **`p-limit(3)`** — max 3 samtidiga Claude-processer oavsett antal sidor
2. **Watchdog 120s stdout idle** — om Claude är tyst i 2 min → SIGTERM → SIGKILL efter 3s
3. **Hard timeout 45 min per process** — absolut kill-switch även om stdout flödar
4. **`activeProcesses` set** — global registry som dödas vid app shutdown
5. **`stderr` räknas som aktivitet** — annars skulle vi döda processer som loggar framsteg på stderr
6. **Stdio buffer-overflow skydd** — `stdio: ['ignore', 'pipe', 'pipe']`, läs stdout löpande, buffra max 10MB innan truncation (implementation detalj)

---

## Saleflow-integration

### Polling-loop (utan tidsgräns)

**Fil:** `apps/genflow/server/poller.ts`

Ersätter nuvarande `worker.ts`-polling. Ingen `maxPolls`-gräns — jobbet får köra så länge som det behöver. Hang-detection sker på Claude-process-nivå (se ovan), inte på polling-nivå.

```ts
import { setTimeout as sleep } from 'node:timers/promises'
import { runJob } from './orchestrator'

let processing = false
let running = true

export async function startPolling(config: Config, log: LogFn, broadcast: BroadcastFn) {
  log('Polling startat')
  while (running) {
    if (!processing) {
      try {
        const job = await fetchPendingJob(config)
        if (job) {
          processing = true
          await handleJob(job, config, log, broadcast)
          processing = false
        }
      } catch (err) {
        log(`Polling-fel (ignorerar): ${err.message}`)
      }
    }
    await sleep(config.pollInterval)
  }
  log('Polling stoppat')
}

async function handleJob(job: GenJob, config: Config, log: LogFn, broadcast: BroadcastFn) {
  log(`Plockar jobb: ${job.slug}`)
  await pickJob(job.id, config)
  broadcast({ type: 'job-start', job })

  try {
    const outputDir = makeOutputDir(job.slug)
    const resultUrl = await runJob(job, outputDir, log)
    await completeJob(job.id, resultUrl, config)
    log(`Klar: ${job.slug} → ${resultUrl}`)
    broadcast({ type: 'job-complete', job, resultUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await failJob(job.id, msg, config)
    log(`Misslyckades: ${job.slug} — ${msg}`)
    broadcast({ type: 'job-failed', job, error: msg })
  }
}

export function stopPolling() {
  running = false
}
```

**Skillnader mot nuvarande `worker.ts`:**
- Tar bort HTTP-anrop till `${flowingAiUrl}/api/scrape` etc — orchestrator:n körs INOM samma process
- Tar bort `maxPolls`-begränsning — pollen är oändlig
- Tar bort HANG_TIMEOUT_MS-logiken i polling — den flyttas till Claude-runner (per-process-nivå)
- Behåller `processing`-flaggan (en jobb i taget per desktop-instans)

### Config-struktur

**Fil:** `~/.genflow/config.json` (samma som idag)

```json
{
  "backendUrl": "https://api.siteflow.se",
  "apiKey": "<X-GenFlow-Key>",
  "pollInterval": 5000
}
```

Notera: `flowingAiUrl` tas bort (det finns ingen extern server att prata med). `pollInterval` default 5000ms.

### Backend-ändringar

**Ingen logisk kod-ändring i Saleflow backend.** Allt som behövs:

1. `backend/config/config.exs:48` — sätt `use_genflow_jobs` default till `true`, ELLER
2. Fly.io secrets: `fly secrets set USE_GENFLOW_JOBS=true`

`run_locally()` i `demo_generation_worker.ex` behålls som fallback. `run_via_genflow()` är oförändrad och använder `GET /api/gen-jobs/pending` etc.

---

## Migration-plan

### Fas 0: Förberedelser (innan kod skrivs)

1. **Backup** — tar en tarball av alla 5 kopior innan något raderas:
   ```
   mkdir -p ~/backup/genflow-2026-04-09
   tar czf ~/backup/genflow-2026-04-09/flowing-ai.tgz ~/dev/flowing-ai/
   tar czf ~/backup/genflow-2026-04-09/flowing-ai-main.tgz ~/dev/flowing-ai-main/
   tar czf ~/backup/genflow-2026-04-09/genflow.tgz ~/dev/genflow/
   tar czf ~/backup/genflow-2026-04-09/genflow-local-server.tgz saleflow/apps/genflow-local-server/
   tar czf ~/backup/genflow-2026-04-09/genflow-4.10.2.tgz saleflow/apps/offert_generator/genflow-4.10.2/
   ```
2. **Skapa en git-branch**: `git checkout -b genflow-unified-redesign`

### Fas 1: Skapa tom app-struktur

1. Skapa `saleflow/apps/genflow/` med:
   - `package.json` (cherry-picka deps från `apps/genflow-local-server/package.json`)
   - `tsconfig.json`
   - `electron-builder.yml`
   - Tomma mappar: `electron/`, `ui/`, `server/`, `pipeline/`, `scraper/`, `skills/`, `scripts/`, `resources/`
2. Lägg till `pnpm-workspace.yaml` i saleflow-rooten om den inte finns
3. `pnpm install` från rooten för att länka

### Fas 2: Cherry-pick kod

**Från `apps/genflow-local-server/`:**
- `electron/main.ts` → `apps/genflow/electron/main.ts` (uppdateras med utilityProcess + tray + login item)
- `electron/preload.ts` → `apps/genflow/electron/preload.ts`
- `src/App.tsx` → `apps/genflow/ui/src/App.tsx`
- `src/main.tsx` → `apps/genflow/ui/src/main.tsx`
- `src/config.ts` → `apps/genflow/ui/src/config.ts` (renderer-sidan) + `apps/genflow/server/lib/config.ts` (server-sidan)
- `src/index.css` → `apps/genflow/ui/src/index.css`
- `src/worker.ts` → OMskrivs som `apps/genflow/server/poller.ts` (se ovan)
- `vite.config.ts` → anpassas för ny struktur
- `package.json` deps → merge:as med nya behov (p-limit, hono/express, osv)

**Från `~/dev/flowing-ai/`:**
- `scraper/scrape.py` → `apps/genflow/scraper/scrape.py` (tar bort `download_images()`)
- `skills/frontend-design/`, `skills/theme-factory/`, `skills/prompt-generator/`, `skills/web-artifacts-builder/` → `apps/genflow/skills/`
- `server/lib/platform.js` → `apps/genflow/server/lib/platform.ts` (portas till TS)

**Från inget** (skrivs nytt enligt specen ovan):
- `apps/genflow/pipeline/strategy-prompt.md`
- `apps/genflow/pipeline/layout-prompt.md`
- `apps/genflow/pipeline/page-prompt.md`
- `apps/genflow/pipeline/unsplash-allowlist.json`
- `apps/genflow/server/index.ts` (utility process entry)
- `apps/genflow/server/orchestrator.ts`
- `apps/genflow/server/claude-runner.ts`
- `apps/genflow/server/image-verifier.ts`
- `apps/genflow/server/lib/layout-substitution.ts`
- `apps/genflow/server/lib/logger.ts`
- `apps/genflow/electron/server-worker.ts`
- `apps/genflow/electron/tray.ts`
- `apps/genflow/scripts/build-scraper.sh`

### Fas 3: Implementation

Implementeras i ordning enligt Fas 4 i rollout (nedan).

### Fas 4: Radering

Efter att nya `apps/genflow/` byggs och testats lokalt i dev-mode:

1. `rm -rf ~/dev/flowing-ai/`
2. `rm -rf ~/dev/flowing-ai-main/`
3. `rm -rf ~/dev/genflow/`
4. `rm -rf saleflow/apps/offert_generator/genflow-4.10.2/`
5. `rm -rf saleflow/apps/genflow-local-server/`
6. Commita raderingarna

Backup-tarballerna behålls i `~/backup/genflow-2026-04-09/` tills vi är helt säkra (minst 2 veckor efter migration).

### Fas 5: Aktivering

1. `fly secrets set USE_GENFLOW_JOBS=true` (eller uppdatera `config.exs`)
2. Starta den nya Genflow-appen lokalt på Macen
3. Skapa en test-demo från Saleflow-dashboarden
4. Verifiera att jobbet går: backend → GenerationJob → genflow-poller → pipeline → Vercel → tillbaka

---

## Rollout

### Ordning för implementation

1. **Monorepo-setup** (`pnpm-workspace.yaml`, `apps/genflow/`, package.json, tsconfig, basic structure)
2. **Electron main + utility process pattern** (tomt server-worker som bara loggar "alive", main process öppnar fönster)
3. **Tray + login item** (menybar-ikon, quit-menu, auto-start-integration)
4. **Server polling loop** (cherry-picka från gamla worker.ts, anpassa till utility process)
5. **Scraper-integration** (spawn Python, cherry-picka scrape.py, ta bort bildnedladdning)
6. **Claude runner** med p-limit + watchdog (ny, defensiv implementation)
7. **Strategy-prompt + runStrategy** (ny prompt-mall, Node parsing av JSON)
8. **Layout-prompt + runLayout + verifyLayout** (ny prompt-mall, Node verifiering)
9. **Page-prompt + runPagePipeline + layout-substitution** (ny prompt-mall, Node substitution)
10. **Polish-pass** (inline prompt, kombinerar review + creative)
11. **Image verifier** (HEAD requests + allowlist)
12. **Deploy (Vercel)** (cherry-picka från gamla deploy-route)
13. **UI integration** (React UI visar status, loggar, jobbkö via IPC från utility process)
14. **End-to-end-test lokalt** (manual trigger från UI utan att gå via backend)
15. **Radera gamla kopior**
16. **Aktivera use_genflow_jobs i backend**
17. **End-to-end-test från Saleflow-dashboarden**

### Rollback-strategi

Om den nya appen visar problem:
- `fly secrets unset USE_GENFLOW_JOBS` → backend går tillbaka till `run_locally` omedelbart
- Starta den gamla `apps/genflow-local-server/` (kvar i backup) om du behöver den för debugging
- Inget kodrollback krävs — bara slå av flaggan

Backup-tarballerna i `~/backup/genflow-2026-04-09/` kan extraheras om du behöver återställa det gamla läget helt.

### Framtida cleanup (ej i scope)

När Flowing AI-flödet varit stabilt i minst 2 veckor:

- `run_locally()` i `demo_generation_worker.ex` raderas
- `backend/priv/demo_generation/brief.md` raderas
- Config-flaggan `use_genflow_jobs` blir alltid-på (tas bort som flagga)
- `Saleflow.Workers.DemoGeneration.DefaultRunner` raderas
- Backup-tarballerna raderas
- Detta görs i en separat cleanup-spec, inte nu.

---

## Edge cases

### Claude CLI zombie-processer vid crash

Utility process-crash → Electron main detekterar via `exit`-event → main restartar utility process efter 5s backoff. Men active Claude subprocessse kan vara kvar. Lösning: utility process har `process.on('exit')` hook som dödar alla `activeProcesses` innan den själv dör. Om det inte räcker: main process håller en separat `childPidRegistry` och kan SIGKILL orphans vid nästa start.

### Hang i utility process

Om utility process själv hänger (oändlig loop, inte bara Claude-subprocesser): main process har en heartbeat-ping var 30:e sekund. Om 3 heartbeats i rad inte svaras → main process SIGKILL:ar utility process och restartar den.

### Python scraper crasch

Spawn error → logga, markera jobbet som failed, fortsätt polling. Orchestrator:n har try/catch kring hela pipelinen.

### Nätverksproblem (backend ej nåbar)

Polling loop catch:ar network errors, loggar tyst, retryar nästa tick. Om backend är nere i timmar samlas ingenting — desktop-appen pollar bara igen och plockar upp jobb när backend kommer tillbaka.

### Flera Genflow-instanser kör samtidigt

Inte stött i denna design. `processing`-flaggan i poller.ts är per-instans, men backend har ingen per-instans-lås. Om två desktop-appar körs samtidigt kan båda plocka samma jobb. Lösning för framtiden: backend använder `FOR UPDATE SKIP LOCKED` på `GenerationJob`-query. INTE i scope för denna spec.

### Vercel-deploy misslyckas

Fångas i orchestrator.ts, jobbet markeras failed med felmeddelandet, site/-katalogen lämnas kvar för debugging.

### Unsplash allow-list tom för businessType

Fallback till `allowlist.default`. Om även det är tomt → logga warning, lämna trasiga URL:er som är. Jobbet failar INTE bara för detta.

### Layout-passet producerar felaktig HTML

`verifyLayout()` kastar → retry 1 gång → om det fortsätter failar hela jobbet via orchestrator.

### Claude hänger tyst

Watchdog i `claude-runner.ts` SIGKILL:ar processen efter 120s stdout-tystnad. Absolut kill-switch efter 45 min. Jobbet markeras failed via vanlig error-hantering.

---

## Filändringar — sammanfattning

### Nya filer (majoritet)

```
apps/genflow/                          (hela katalogen ny)
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── README.md
├── pnpm-lock.yaml (auto)
├── .gitignore
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── server-worker.ts
│   └── tray.ts
├── ui/
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── config.ts
│       ├── components/
│       │   ├── StatusPanel.tsx
│       │   ├── LogViewer.tsx
│       │   ├── JobQueue.tsx
│       │   └── ConfigPanel.tsx
│       └── index.css
├── server/
│   ├── index.ts
│   ├── poller.ts
│   ├── orchestrator.ts
│   ├── claude-runner.ts
│   ├── image-verifier.ts
│   └── lib/
│       ├── platform.ts
│       ├── layout-substitution.ts
│       ├── logger.ts
│       └── config.ts
├── pipeline/
│   ├── strategy-prompt.md
│   ├── layout-prompt.md
│   ├── page-prompt.md
│   └── unsplash-allowlist.json
├── scraper/
│   ├── scrape.py
│   └── requirements.txt
├── skills/
│   ├── frontend-design/
│   ├── theme-factory/
│   ├── prompt-generator/
│   └── web-artifacts-builder/
├── scripts/
│   └── build-scraper.sh
└── resources/
    ├── tray-icon.png
    └── app-icon.icns
```

### Ändrade filer (utanför apps/genflow/)

- `pnpm-workspace.yaml` — ny eller uppdaterad med `apps/*` entry
- `backend/config/config.exs` — sätt `use_genflow_jobs` default till `true`
- Fly.io secrets — `fly secrets set USE_GENFLOW_JOBS=true`

### Raderade filer

- `~/dev/flowing-ai/` (hela katalogen)
- `~/dev/flowing-ai-main/` (hela katalogen)
- `~/dev/genflow/` (hela katalogen)
- `saleflow/apps/offert_generator/genflow-4.10.2/` (hela katalogen)
- `saleflow/apps/genflow-local-server/` (hela katalogen)

### Orörda filer (viktigt — fallback)

- `backend/lib/saleflow/workers/demo_generation_worker.ex` — både `run_via_genflow` och `run_locally` behålls parallellt
- `backend/priv/demo_generation/brief.md` — orörd, fallback för `run_locally`
- `Saleflow.Workers.DemoGeneration.DefaultRunner` — orörd
- `backend/lib/saleflow/generation/` (GenerationJob Ash-resurs) — orörd, `run_via_genflow` använder den redan

---

## Öppna frågor

Jag markerar dessa som "kvar att bestämma i implementation", inte blockers för specen:

1. **Hono vs Express** — researchen rekommenderade Hono som modernare val. Jag har beskrivit "server/" utan att specificera vilket ramverk. Implementationen kan välja. Express är säkrare (känt), Hono är snabbare + TS-first. Båda fungerar i utility process.
2. **Menubar-paket** — jag har beskrivit egen Tray-implementation. Alternativ: `max-mapper/menubar` npm-paket som ger Tray + popover klart. Implementationen kan välja.
3. **Signing/notarization** — för att SMAppService ska fungera pålitligt i prod behöver appen vara signed + notarized. Detta kräver Apple Developer account + certifikat. Ej i scope för denna spec, men måste lösas innan prod-deploy.
4. **PyInstaller-build för flera arkitekturer** — vi börjar med darwin-arm64 (Douglas's Mac). Om vi senare vill stödja Intel Mac eller andra maskiner behöver `scripts/build-scraper.sh` byggas med rätt target.
