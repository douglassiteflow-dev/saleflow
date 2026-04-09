# Genflow CMS Multi-Page — Design Spec

## Översikt

Bygg om Genflow-hemsidogenereringen till en multi-page-arkitektur där:

- En design genererar flera sidor som delar exakt samma tema, header, footer och navbar
- Inga kundbilder laddas ner eller används — bara kurerade Unsplash stock
- Alla tjänster matas automatiskt in i pipelinen; strategen väljer hur de presenteras, inte vilka som inkluderas
- Strategen bestämmer vilka sidor som behövs baserat på innehållsvolymen
- Sid-generering körs parallellt per sida (upp till 10 samtidiga Claude-processer)
- Review och creative kombineras till ett enda polish-pass per sida
- Cost tracking tas bort helt (vi kör via CLI, kostnad spåras externt)
- Ingen polling-timeout — jobbet får köra obegränsat så länge pipeline.log växer. Hängda jobb detekteras via 40-minuters tystnad på loggen.

Systemet består av tre komponenter: Saleflow Backend (Phoenix på fly.io), Genflow Local Server (Electron desktop-app på Douglas's Mac), Flowing AI (Node/Express-server på samma Mac, port 1337).

**Viktigt om nuvarande läge:** I produktion idag kör Saleflow Backend Claude CLI direkt från Elixir via `run_locally`-path i `DemoGenerationWorker`. Flowing AI-flödet (desktop-app → flowing-ai-server) finns implementerat men är **avstängt** via config-flaggan `use_genflow_jobs=false`. Denna spec aktiverar Flowing AI-flödet och utför där alla de nya förbättringarna. Se sektionen "Förutsättningar och infrastruktur" nedan för vad som krävs för att aktivera flödet i produktion.

Huvudparten av implementations-arbetet sker i `flowing-ai/`-katalogen. Desktop-appen får en liten ändring (hang-detection + förenklad request body). Saleflow backend får en config-ändring (slå på flaggan) men ingen logisk kod-ändring — `run_via_genflow`-pathen finns redan klar.

---

## Arkitektur

### Nuvarande pipeline (som tas bort)

```
scrape → strategy → pipeline(bygger index.html) → review → creative → deploy
```

### Ny pipeline

```
scrape (quick-mode utan bildnedladdning)
  ↓
strategy pass (sekventiellt)
  ↓
layout pass (sekventiellt) — producerar layout.html
  ↓
┌─ pipeline(index)    → polish(index)    ─┐
├─ pipeline(tjanster) → polish(tjanster) ─┤  parallellt per sida
├─ pipeline(om-oss)   → polish(om-oss)   ─┤  (upp till 10 samtidigt)
├─ pipeline(galleri)  → polish(galleri)  ─┤
└─ pipeline(kontakt)  → polish(kontakt)  ─┘
  ↓
bildverifiering (Node HEAD-requests, ingen Claude)
  ↓
deploy
```

Parallellisering sker via `Promise.all` i Node — varje sida är en oberoende subprocess. Polish-passet för en sida startar så fort sidans pipeline-pass är klar, utan att vänta på syskon.

### Sekventiella dependencies

- `strategy` → `layout`: layout läser strategy.pages[] för att veta vilka nav-länkar som behövs
- `layout` → `pipeline`: varje sida behöver läsa layout.html som skelett
- `pipeline` → `polish`: polish läser den genererade filen för att granska och förbättra
- `polish` → `bildverifiering`: verifieraren läser alla `site/*.html` efter polish

---

## Artefakter per jobb

```
$OUTPUT_DIR/{slug}/
├── företagsdata.json           — från scrape (utan bild-URL-nedladdning)
├── strategy.json               — sidval + sektion-beslut per sida + galleri-teman
├── layout.html                 — delad mall (theme + head + header + footer + nav)
├── pipeline.log                — live logg (heartbeat för hang-detection)
├── pages/                      — temp-katalog med content-fragment per sida
│   ├── index.content.html      — fragment Claude skrev, innan Node-substitution
│   ├── tjanster.content.html
│   ├── om-oss.content.html
│   ├── galleri.content.html
│   └── kontakt.content.html
└── site/                       — slutresultat efter Node-substitution + polish
    ├── index.html              — alltid
    ├── tjanster.html           — om strategen valde den
    ├── om-oss.html             — om strategen valde den
    ├── galleri.html            — om strategen valde den
    └── kontakt.html            — om strategen valde den
```

`pages/`-katalogen kan raderas efter `site/` är färdig, men vi låter den ligga kvar som debug-artefakt för att kunna jämföra Claude-output mot slutresultat.

Observera att `bilder/`-katalogen **inte** finns längre. Inga `brief.md`, `theme.json`, `prompt.md`, `recensioner.json`, `selections.json`, `cost.json` skapas.

---

## Strategy-passet (reviderat)

### Syfte

Bestämmer vilka sidor som ska skapas, hur tjänster fördelas mellan sidor, och vilka Unsplash-söktermar som ska användas för galleri/hero-bilder.

### Input

- Hela `företagsdata.json` (utan `image_urls`-listans nedladdade filer; fältet kan finnas kvar som metadata)
- Antal recensioner (från samma fil, fältet `recensioner` eller `reviewCount`)

Strategen får **inget** om valda bilder eller valda tjänster — den jobbar alltid med allt.

### Prompt-mall: `flowing-ai/pipeline/strategy-prompt.md`

Ersätter nuvarande `strategy-prompt.md` helt. Nytt innehåll:

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
- När du väljer galleri: ge 3-5 konkreta Unsplash-söktermar baserat på affärstypen (t.ex. "modern salong interiör", "hår styling närbild", "nagelbehandling")

## Ingen team-sida

Personal nämns som text i `om-oss` eller i footern — ingen dedikerad team-sektion med porträtt.

## Output

Respondera med ENDAST valid JSON, inget annat:

\`\`\`json
{
  "reasoning": "2-4 meningar motivering för dina val",
  "businessType": "frisör | spa | nagel | massage | skönhet | klinik | annat",
  "pages": [
    {
      "slug": "index",
      "filename": "index.html",
      "sections": ["hero", "intro", "featured-tjanster", "recensioner", "kontakt-cta"],
      "reason": "Huvudsida — alltid obligatorisk"
    }
  ],
  "services": {
    "total": 0,
    "featuredForIndex": [
      {"namn": "Klippning", "kategori": "Hår", "reason": "populärast i kategorin"}
    ],
    "categoryOrder": ["Hår", "Styling", "Behandlingar"]
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

### Variabelsubstitution

I `claude-runner.js` → `runStrategy()`:
- `$BUSINESS_DATA` = innehåll av `företagsdata.json` (första 3000 tecken, ökat från nuvarande 2000 för att rymma recensioner)

### Körning

```js
spawn(CLAUDE_BIN, [
  "--dangerously-skip-permissions",
  "--bare",
  "-p", prompt,
  "--output-format", "json",
  "--max-turns", "5",  // sänkt från 10 — enklare uppgift nu
], { cwd: outputDir });
```

### Output

Parseras och sparas till `strategy.json`. Samma parsning-logik som idag (hitta JSON-blob i Claude-resultatet).

---

## Layout-passet (NYTT)

### Syfte

Producerar en delad HTML-mall (`layout.html`) som alla sidor renderas från. Garanterar identisk tema, header, footer och navbar på varje sida.

### Input

- `strategy.json` — framför allt `pages[]` (för nav-länkar) och `businessType` (för tema-val)
- `företagsdata.json` — för företagsnamn, adress, öppettider, sociala länkar

### Prompt-mall: `flowing-ai/pipeline/layout-prompt.md` (ny fil)

```markdown
# Layout-mall för flersidig webbplats

Du är webbdesigner. Producera EN enda fil — `layout.html` — som fungerar som delad mall för alla sidor på denna webbplats.

## Företagsdata

$BUSINESS_DATA

## Affärstyp

$BUSINESS_TYPE

## Sidor som kommer skapas

$PAGES_LIST

Navbaren MÅSTE innehålla länkar till exakt dessa sidor och INGET annat.

## Krav på `layout.html`

1. Komplett `<!DOCTYPE html>` dokument på svenska (lang="sv")
2. Fullständig `<head>` med:
   - `<meta charset>`, `<meta viewport>`
   - `<title>{{PAGE_TITLE}}</title>` (platshållare — oförändrad)
   - `<meta name="description" content="{{PAGE_DESCRIPTION}}">` (platshållare — oförändrad)
   - Google Fonts `<link>` (välj 1-2 fonter som passar affärstypen)
   - En enda `<style>`-block som innehåller ALL CSS för webbplatsen:
     - CSS custom properties (`--primary`, `--secondary`, `--accent`, `--text`, `--bg`, `--surface`)
     - Reset och base-stilar
     - Typografi (h1-h6, body, small)
     - Layout-hjälpare (container, section, grid)
     - Komponenter: header, nav, footer, knappar (primary/secondary), kort, hero, bento-grid, recensions-scroll, kontaktformulär
     - Responsiv navbar med hamburger-meny på mobil
     - Media queries för mobil/tablet/desktop
3. `<header>` med:
   - Logo/företagsnamn som länk till `./index.html`
   - `<nav>` med `<a>` för varje sida i $PAGES_LIST
   - Varje `<a>` har `data-page="<slug>"` attribut (används för active-state)
4. `<main><!-- CONTENT --></main>` — EXAKT denna kommentar, inget runtom, inget innehåll i `<main>`
5. `<footer>` med:
   - Företagsnamn och kort beskrivning
   - Adress, telefon, email (från företagsdata)
   - Öppettider (från företagsdata)
   - Sociala länkar om de finns
   - Länkar till alla sidor i $PAGES_LIST

## Färgpalett

Välj färger baserat på `businessType`:
- frisör / skönhet: varma pasteller, koppar, champagne
- spa: lugna jordnära toner, sage, terracotta
- nagel: mjukt rosa, nude, accentfärg
- massage: neutrala jordnära, mörkt trä
- klinik: rent vitt, ljusblått, mint
- annat: välj baserat på företagets namn och beskrivning

## Typografi

Välj två Google Fonts:
- En för rubriker (serif eller distinctive sans-serif)
- En för brödtext (läsbar sans-serif)

## FÖRBJUDET

- `<main>`-sektionen får INTE innehålla något annat än `<!-- CONTENT -->`
- Ingen sidspecifik text i headers/footer (inga "Välkommen" etc — bara evigt innehåll som företagsnamn, kontaktinfo)
- Inga placeholder-texter som "Lorem ipsum"
- Inga externa CSS-filer eller CDN:er utöver Google Fonts

## Leverans

Spara till `$OUTPUT_DIR/layout.html`. Ingen annan fil ska skapas i detta pass.
```

### Variabelsubstitution

I `claude-runner.js` → `runLayout()`:
- `$BUSINESS_DATA` = första 2000 tecken av `företagsdata.json`
- `$BUSINESS_TYPE` = `strategy.businessType`
- `$PAGES_LIST` = markdown-lista från `strategy.pages[]`:
  ```
  - index (index.html)
  - tjanster (tjanster.html)
  - om-oss (om-oss.html)
  ```

### Körning

```js
spawn(CLAUDE_BIN, [
  "--dangerously-skip-permissions",
  "--bare",
  "--add-dir", SKILLS_DIR,
  "-p", prompt,
  "--output-format", "stream-json",
], { cwd: outputDir });
```

Använder `--add-dir skills/` så Claude har tillgång till `frontend-design` och `theme-factory` skills (som idag).

### Verifiering efter layout-passet

Innan pipeline-passet startar kontrolleras att `layout.html`:

1. Finns på `$OUTPUT_DIR/layout.html`
2. Innehåller exakt ett `<!-- CONTENT -->` (regex-check)
3. Innehåller `{{PAGE_TITLE}}` som platshållare
4. Innehåller `{{PAGE_DESCRIPTION}}` som platshållare
5. Har ett `<style>`-block i `<head>`
6. Har en `<nav>` med `<a data-page="<slug>">` för varje sida i `strategy.pages[]`

Om någon check fails → layout-passet körs om en gång med samma prompt. Om även det faller → `runLayout` kastar, hela jobbet failar via `worker.ts`-hang-detection.

---

## Per-sidig pipeline-pass (reviderat)

### Syfte

Varje sida i `strategy.pages[]` får en egen Claude-körning som **bara producerar innehåll för `<main>`** (content-fragmentet). Claude rör aldrig själva layout-filen. Node-koden i `claude-runner.js` gör sedan deterministisk substitution av layout + content → slutlig sidfil.

Detta isolerar Claude till vad den är bra på (kreativ HTML-generering) och Node till vad den är bra på (exakt text-substitution). Det eliminerar all risk för att Claude av misstag ändrar `<head>`, `<header>` eller `<footer>`.

### Flöde per sida

1. Claude läser `layout.html` (read-only, för att se CSS-klasser och tema)
2. Claude genererar content-HTML och skriver till `$OUTPUT_DIR/pages/$PAGE_SLUG.content.html`
3. Node läser `layout.html` + content-filen
4. Node gör substitution:
   - `{{PAGE_TITLE}}` → sid-titel
   - `{{PAGE_DESCRIPTION}}` → meta-beskrivning
   - Lägger till `class="active"` på `<a data-page="$PAGE_SLUG">`
   - `<!-- CONTENT -->` → content-fragmentet
5. Node skriver resultatet till `$OUTPUT_DIR/site/$PAGE_FILENAME`

### Prompt-mall: `flowing-ai/pipeline/page-prompt.md` (ny fil, ersätter `brief.md`)

```markdown
# Sid-innehåll: $PAGE_SLUG

Du bygger INNEHÅLLET för sidan `$PAGE_FILENAME` i en flersidig webbplats. Den delade mallen finns i `$LAYOUT_PATH`. Din uppgift är BARA att producera content-fragmentet som ska sättas in i `<main>`. Du får INTE redigera layout-filen och INTE skriva den slutliga sidfilen — det gör ett senare Node-steg automatiskt.

## Företagsdata

$BUSINESS_DATA

## Strategi

$STRATEGY

## Sidspecifika data

$PAGE_CONTEXT

## Process

1. **Läs** `$LAYOUT_PATH` (använd Read med limit 1000) för att förstå:
   - Vilka CSS-klasser och CSS-variabler som finns i `<style>`-blocket
   - Vilken font-familj och färgpalett som används
   - Hur existerande komponenter (knappar, kort, hero) är strukturerade

2. **Generera** HTML-innehåll för sektionerna: $PAGE_SECTIONS

3. **Skriv ENDAST content-fragmentet** till: `$CONTENT_PATH`
   - Detta är EN fil som innehåller HTML utan `<html>`, `<head>`, `<body>`, `<header>`, `<footer>`, `<main>`-omslag
   - Alltså: bara sektionerna som ska visas inuti `<main>` (t.ex. `<section class="hero">…</section><section class="intro">…</section>` osv)

## Regler för ditt content-fragment

- **Bilder** är endast Unsplash-URL:er i formatet `https://images.unsplash.com/photo-XXXX?w=1200&q=80`. Aldrig lokala filer.
- **Ingen `<style>`-tagg** i normal fall — CSS finns redan i layouten. Om du absolut behöver sidspecifik styling, lägg ett litet `<style>`-block överst i ditt content-fragment.
- **Inget `<script>`** i ditt fragment — om du behöver JS (t.ex. för hamburger-meny), det ska redan finnas i layouten.
- **CSS-klasser** ska matcha de som finns i layoutens `<style>`-block. Läs layoutens `<style>` noggrant.
- **Svenska** text genomgående.
- **Aldrig** skriv till `site/`-katalogen — bara till `$CONTENT_PATH`.
- **Aldrig** läs eller ändra någon annan fil än `$LAYOUT_PATH` (read) och `$CONTENT_PATH` (write).

## Sidtyp-specifika regler

$PAGE_TYPE_RULES
```

### Per-sidtyp: `$PAGE_TYPE_RULES`

Olika strängar matas in baserat på sidans `slug`:

**`index`:**
```
- Hero-sektion med företagsnamn, tagline, primär CTA-knapp, Unsplash-bakgrundsbild
- Kort intro-text (2-3 meningar om företaget)
- Featured tjänster-grid (bara de som listas i strategy.services.featuredForIndex)
- Om strategy.reviews.displayMode === "infinity-scroll": horisontell auto-scroll med duplicerade kort, pause on hover, 5-8 recensioner
- Om strategy.reviews.displayMode === "statiska-kort": 3 kort i grid
- Kontakt-CTA-sektion med adress, telefon, knapp till kontakt.html (eller boka extern länk)
```

**`tjanster`:**
```
- Rubriksektion med "Våra tjänster"
- Tjänster grupperade per kategori i strategy.services.categoryOrder
- Varje tjänst: namn, beskrivning (om finns), pris, varaktighet
- ALLA tjänster från företagsdata.json (inte bara featured)
- Strukturerad layout (inte kort med bakgrundsbilder — rent och scannable)
```

**`om-oss`:**
```
- Hero med kort företagsbeskrivning (1-2 meningar)
- Historia/värderingar från om_oss-text i företagsdata
- Personal nämns som TEXT (ingen team-grid, inga porträtt)
- Eventuell Unsplash-bild av lokaltyp (salong-interiör etc)
```

**`galleri`:**
```
- Bento-grid layout (variarade cell-storlekar, inte uniform grid)
- 8-12 Unsplash-bilder baserat på strategy.gallery.themes
- ALDRIG infinity-scroll eller carousel
- Kort rubriker/captions är OK men inte obligatoriska
- Hover-effekter är tillåtna
```

**`kontakt`:**
```
- Kontaktformulär (rent visuellt — skickar inget, action="#")
- Kontaktinfo: adress, telefon, email
- Öppettider som tabell/lista
- Google Maps-iframe om adressen finns (använd bara generisk <iframe src="https://maps.google.com/maps?q=[adress]&output=embed">)
```

### Variabelsubstitution

I `claude-runner.js` → `runPagePipeline(pageSpec, strategy, outputDir)`:

- `$PAGE_SLUG` = `pageSpec.slug`
- `$PAGE_FILENAME` = `pageSpec.filename`
- `$PAGE_SECTIONS` = JSON.stringify(`pageSpec.sections`)
- `$PAGE_CONTEXT` = olika per sidtyp:
  - `index`: featured services + reviews.slice(0, 8) + recensionsmode
  - `tjanster`: alla services med `categoryOrder`
  - `om-oss`: om_oss-text + personal-namn (som text)
  - `galleri`: `strategy.gallery.themes`
  - `kontakt`: adress, telefon, email, öppettider
- `$PAGE_TYPE_RULES` = strängen ovan per sidtyp
- `$BUSINESS_DATA` = första 2000 tecken av företagsdata.json
- `$STRATEGY` = hela `strategy.json`
- `$LAYOUT_PATH` = absolut sökväg till `layout.html`
- `$CONTENT_PATH` = absolut sökväg till `$OUTPUT_DIR/pages/$PAGE_SLUG.content.html` (Claude skriver till denna)

### Körning

```js
spawn(CLAUDE_BIN, [
  "--dangerously-skip-permissions",
  "--bare",
  "--add-dir", SKILLS_DIR,
  "-p", prompt,
  "--output-format", "stream-json",
], { cwd: outputDir });
```

### Node-substitution efter Claude

När Claude-processen stängt framgångsrikt och `$CONTENT_PATH` existerar, gör `runPagePipeline` följande i Node:

```js
async function renderPageFromLayout(pageSpec, strategy, outputDir) {
  const contentPath = join(outputDir, "pages", `${pageSpec.slug}.content.html`);
  const layoutPath = join(outputDir, "layout.html");
  const sitePath = join(outputDir, "site", pageSpec.filename);

  if (!existsSync(contentPath)) {
    throw new Error(`Content-fragment saknas: ${contentPath}`);
  }

  const content = readFileSync(contentPath, "utf-8");
  const layout = readFileSync(layoutPath, "utf-8");

  const businessName = readBusinessName(outputDir);
  const pageTitle = buildPageTitle(pageSpec.slug, businessName);
  const pageDescription = buildPageDescription(pageSpec.slug, businessName);

  let html = layout
    .replace("{{PAGE_TITLE}}", escapeHtml(pageTitle))
    .replace("{{PAGE_DESCRIPTION}}", escapeHtml(pageDescription))
    .replace("<!-- CONTENT -->", content);

  // Sätt active-klass på nav-länk för denna sida
  const activeRe = new RegExp(`(<a[^>]*data-page=["']${pageSpec.slug}["'][^>]*)(class=["'][^"']*["'])?`);
  html = html.replace(activeRe, (match, prefix, existingClass) => {
    if (existingClass) {
      const classes = existingClass.match(/class=["']([^"']*)["']/)[1];
      return `${prefix}class="${classes} active"`;
    }
    return `${prefix} class="active"`;
  });

  writeFileSync(sitePath, html);
}

function buildPageTitle(slug, businessName) {
  const titles = {
    index: businessName,
    tjanster: `Tjänster — ${businessName}`,
    "om-oss": `Om oss — ${businessName}`,
    galleri: `Galleri — ${businessName}`,
    kontakt: `Kontakt — ${businessName}`,
  };
  return titles[slug] || businessName;
}

function buildPageDescription(slug, businessName) {
  const descriptions = {
    index: `Välkommen till ${businessName}. Boka tid online.`,
    tjanster: `Alla tjänster och priser hos ${businessName}.`,
    "om-oss": `Läs mer om ${businessName} — vår historia och värderingar.`,
    galleri: `Bildgalleri från ${businessName}.`,
    kontakt: `Kontakta ${businessName} — adress, telefon och öppettider.`,
  };
  return descriptions[slug] || businessName;
}
```

Det här steget körs efter Claude-processen stängt. Inga fler Claude-anrop — ren Node text-manipulation.

### Parallellisering

I `routes/generate.js`:

```js
const pagePromises = strategy.pages.map(page =>
  runPagePipeline(page, strategy, outputDir)
    .then(() => runPolish(page, outputDir))
    .catch(err => {
      log(`Sida ${page.slug} misslyckades: ${err.message}`);
      return { failed: page.slug };
    })
);
const results = await Promise.all(pagePromises);
```

Varje sida kör pipeline följt av polish i sekvens, men olika sidor körs parallellt. Upp till `strategy.pages.length` samtidiga Claude-processer (maximalt 5 i praktiken).

### Fel-hantering

Om en enskild sida failar loggas felet men övriga sidor fortsätter. Om `index.html` failar räknas hela jobbet som misslyckat (index är obligatorisk). Om en undersida failar fortsätter jobbet men resultatet saknar den sidan, och nav-länken till den sidan måste tas bort från alla övriga sidor i en post-processing-loop.

---

## Polish-passet (ersätter review + creative)

### Syfte

Kombinerar review och creative till en enda Claude-körning per sida. Fixar layout/typografi-problem OCH lägger till kreativa förbättringar. Körs parallellt med andra sidors polish, direkt efter respektive sidas pipeline-pass är klart.

### Prompt (inline i `claude-runner.js`, inte en fil — samma mönster som nuvarande review/creative)

```
Du är senior webbutvecklare och kreativ designer. Du granskar OCH förbättrar sidan `$PAGE_FILENAME` som är del av en flersidig webbplats. Mallen `layout.html` har redan genererats separat och är ansvarig för tema, header, footer och `<style>`-blocket. Din uppgift är att polera `<main>`-innehållet.

Företag: $BUSINESS_NAME
Affärstyp: $BUSINESS_TYPE
Sida: $PAGE_SLUG

## STEG 1: Läs filen på EN GÅNG (Read med limit 1000)

## STEG 2: Granska — identifiera problem i `<main>`-innehållet

Leta efter:
- Ojämna grids, dålig spacing, överlappande element
- Inkonsekvent typografi (blandade font-sizes på samma nivå)
- Dålig kontrast mellan text och bakgrund
- Tomma sektioner, placeholder-text ("Lorem ipsum", "Coming soon")
- Brutna eller orealistiska Unsplash-URL:er
- Två infinity-scroll-sektioner direkt efter varandra (om detta finns: gör den andra statisk)

## STEG 3: Förbättra — lägg till 2-4 av följande

- Hero parallax (OBLIGATORISKT på index.html om sidan har hero): background-attachment: fixed
- Fade-in-on-scroll-animationer (CSS keyframes + animation-delay per element)
- Hover-effekter på kort och knappar
- Gradient overlays på hero-bilder för textläsbarhet
- Glassmorphism på kort (backdrop-filter: blur)
- SVG wave-dividers mellan sektioner
- Subtila accent-linjer eller dots som dekoration

## REGLER — STRIKT

- Du får BARA redigera innehåll mellan `<main>` och `</main>`
- FÖRBJUDET att ändra `<head>`, `<header>`, `<footer>`, `<style>` eller något utanför `<main>`
- Om du behöver lägga till sidspecifik CSS: lägg ett `<style>`-block DIREKT efter `<main>`-öppningen, INUTI `<main>`. Aldrig i `<head>`.
- Ändra INTE företagsnamn, tjänster, priser, telefonnummer, adress eller kontaktinfo
- Ändra INTE nav-länkar eller deras `data-page`-attribut
- Ändra INTE active-state klassen (`class="active"`)
- ALL text på svenska

## Beskriv kort på svenska vad du fixade
```

### Variabelsubstitution

- `$PAGE_FILENAME` = `pageSpec.filename`
- `$BUSINESS_NAME` = från `företagsdata.json`
- `$BUSINESS_TYPE` = `strategy.businessType`
- `$PAGE_SLUG` = `pageSpec.slug`

### Körning

```js
spawn(CLAUDE_BIN, [
  "--dangerously-skip-permissions",
  "--bare",
  "-p", prompt,
  "--output-format", "stream-json",
], { cwd: siteDir });  // cwd är site-katalogen så Edit kan hitta filen med relativ path
```

### Verifiering

Efter polish ska:
- Filen fortfarande finnas
- `<!-- CONTENT -->` ska INTE finnas kvar (den ska ha ersatts)
- `<head>` ska vara oförändrat jämfört med layout.html (diff-check)
- `<nav>` ska fortfarande ha alla `data-page`-attribut

Om någon check failar loggas varning men jobbet fortsätter (polish-fel är inte dödsstöt).

---

## Bildverifiering (NYTT — Node, ingen Claude)

### Syfte

Efter alla sidor är polerade: hitta trasiga Unsplash-URL:er och ersätt dem från en kurerad allow-list.

### Ny fil: `flowing-ai/server/lib/image-verifier.js`

```js
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const ALLOWLIST_PATH = join(RESOURCES, "pipeline/unsplash-allowlist.json");
const UNSPLASH_RE = /https:\/\/images\.unsplash\.com\/[^\s"')]+/g;

export async function verifyAllImages(siteDir, businessType, log) {
  const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8"));
  const fallbacks = allowlist[businessType] || allowlist.default;

  const htmlFiles = readdirSync(siteDir).filter(f => f.endsWith(".html"));

  for (const file of htmlFiles) {
    const path = join(siteDir, file);
    let html = readFileSync(path, "utf-8");
    const urls = [...new Set(html.match(UNSPLASH_RE) || [])];

    let fallbackIndex = 0;
    for (const url of urls) {
      if (!(await isReachable(url))) {
        const fallback = fallbacks[fallbackIndex % fallbacks.length];
        fallbackIndex++;
        log(`Ersätter trasig bild i ${file}: ${url.slice(0, 60)}... → allow-list`);
        html = html.split(url).join(fallback);
      }
    }
    writeFileSync(path, html);
  }
}

async function isReachable(url) {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
```

### Ny fil: `flowing-ai/pipeline/unsplash-allowlist.json`

```json
{
  "frisör": [
    "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=80",
    "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1200&q=80",
    "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1200&q=80"
  ],
  "spa": [
    "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200&q=80",
    "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1200&q=80"
  ],
  "nagel": [
    "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200&q=80",
    "https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=1200&q=80"
  ],
  "massage": [
    "https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=1200&q=80",
    "https://images.unsplash.com/photo-1559599101-f09722fb4948?w=1200&q=80"
  ],
  "skönhet": [
    "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200&q=80",
    "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200&q=80"
  ],
  "klinik": [
    "https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=1200&q=80",
    "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80"
  ],
  "annat": [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
    "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80"
  ],
  "default": [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"
  ]
}
```

Vi startar med 10-15 URL:er per affärstyp. Listan valideras manuellt (vi HEAD-requestar varje en gång innan vi commitar). Listan växer organiskt när vi ser vad som saknas.

### Placering i pipelinen

Anropas från `routes/generate.js` efter alla polish-passes är klara:

```js
await Promise.all(pagePromises);  // alla sidor + polish
await verifyAllImages(siteDir, strategy.businessType, log);
log("Bildverifiering klar");
```

---

## Scraper-ändringar

### Fil: `flowing-ai/scraper/scrape.py`

**Ta bort:**
- `download_images()`-funktionen (raderas helt)
- Anropet till `download_images()` i main-flödet (raderas)
- Skapandet av `bilder/`-katalogen (raderas)

**Behåll:**
- `extract_image_urls()` (metadatan kan fortfarande finnas i `företagsdata.json` som informativ lista)
- Allt annat (tjänster, personal, öppettider, recensioner, aggregateRating)

**Ändring i output:** `företagsdata.json` får `image_urls: [<url>, ...]` men ingen katalog `bilder/` skapas.

### Fil: `flowing-ai/server/routes/scrape.js`

- Ta bort `images`-logiken i response:en (rad 35-41 i nuvarande fil)
- Response blir bara `{ slug, data }`

### Fil: `flowing-ai/server/routes/generate.js`

- Ta bort läsningen av `selections.json` och `selectedImages`/`selectedServices`
- Ta bort `filteredServices`-filtrering — strategy-passet använder hela `företagsdata.json` direkt
- Ta bort `writeFileSync(selections.json)`-anropet

---

## Worker.ts-ändringar

### Fil: `apps/genflow-local-server/src/worker.ts`

### Hang-detection istället för maxPolls

**Gammalt (`worker.ts:140`):**
```ts
const maxPolls = 300; // 25 min at 5s interval
for (let i = 0; i < maxPolls; i++) { ... }
```

**Nytt:**
```ts
const HANG_TIMEOUT_MS = 40 * 60 * 1000;  // 40 min utan logg = hängt
let lastProgress = Date.now();
let logSize = 0;
let done = false;

while (!done) {
  await new Promise(r => setTimeout(r, 5000));

  // Tail nya logg-rader
  try {
    const tailRes = await fetch(
      `${config.flowingAiUrl}/api/generate/${slug}/log-tail?from=${logSize}`
    );
    if (tailRes.ok) {
      const { content, size } = await tailRes.json() as { content: string; size: number };
      if (content) {
        lastProgress = Date.now();
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed) log(`  ${trimmed}`);
        }
      }
      logSize = size;
    }
  } catch {
    // tyst — statusen nedan är auktoritativ
  }

  // Hang-detection
  if (Date.now() - lastProgress > HANG_TIMEOUT_MS) {
    throw new Error("Generering hängd — ingen logg-uppdatering på 40 minuter");
  }

  // Status-kolla
  const statusRes = await fetch(`${config.flowingAiUrl}/api/generate/${slug}/status`);
  if (!statusRes.ok) continue;
  const statusData = await statusRes.json();
  if (["done", "complete", "ready"].includes(statusData.status)) {
    log("  ✓ Generering klar");
    done = true;
  } else if (statusData.status === "error" || statusData.error) {
    throw new Error(`Generering fel: ${statusData.error || "unknown"}`);
  }
}
```

### Förenklad request till `/api/generate`

**Gammalt (`worker.ts:124-132`):**
```ts
const genRes = await fetch(`${config.flowingAiUrl}/api/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    slug,
    selectedImages: [],
    selectedServices: scraped.services || scraped.selectedServices || [],
  }),
});
```

**Nytt:**
```ts
const genRes = await fetch(`${config.flowingAiUrl}/api/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slug }),
});
```

`selectedImages` och `selectedServices` behövs inte längre — allt läses från `företagsdata.json` av strategy- och pipeline-passen.

---

## claude-runner.js — omskrivning

Nuvarande `flowing-ai/server/lib/claude-runner.js` har fyra exporter: `runStrategy`, `runPipeline`, `runReview`, `runCreativePass`. Cost-tracking-logik finns utspridd.

**Nya exporter:**
- `runStrategy(outputDir)` — reviderad, enklare input (ingen `selectedImages`/`filteredServices`/`customer`)
- `runLayout(strategy, outputDir)` — ny
- `runPagePipeline(pageSpec, strategy, outputDir)` — ersätter `runPipeline`
- `runPolish(pageSpec, outputDir)` — ersätter `runReview` + `runCreativePass`
- `pipelineEvents` — oförändrad (EventEmitter för live-logg)

**Borttaget:**
- All `costUsd`-parsning och logging
- `runReview`, `runCreativePass` (slås ihop till `runPolish`)
- `runPipeline` (ersätts av per-sida-variant)

### Layout-verifiering helper

```js
function verifyLayout(layoutPath, strategy) {
  if (!existsSync(layoutPath)) throw new Error("layout.html saknas");
  const html = readFileSync(layoutPath, "utf-8");
  if ((html.match(/<!-- CONTENT -->/g) || []).length !== 1)
    throw new Error("layout.html saknar exakt en <!-- CONTENT --> platshållare");
  if (!html.includes("{{PAGE_TITLE}}"))
    throw new Error("layout.html saknar {{PAGE_TITLE}}");
  if (!html.includes("{{PAGE_DESCRIPTION}}"))
    throw new Error("layout.html saknar {{PAGE_DESCRIPTION}}");
  if (!/<style[^>]*>[\s\S]*?<\/style>/.test(html))
    throw new Error("layout.html saknar <style>-block");
  for (const page of strategy.pages) {
    const re = new RegExp(`data-page=["']${page.slug}["']`);
    if (!re.test(html))
      throw new Error(`layout.html saknar nav-länk för ${page.slug}`);
  }
}
```

### Polish-verifiering helper

```js
function verifyPolishedPage(filePath, layoutHtml) {
  if (!existsSync(filePath)) return { ok: false, reason: "filen saknas" };
  const html = readFileSync(filePath, "utf-8");
  if (html.includes("<!-- CONTENT -->"))
    return { ok: false, reason: "CONTENT-platshållare finns kvar" };
  // Head-diff: extrahera <head>-blocket från båda och jämför
  const headRe = /<head>[\s\S]*?<\/head>/;
  const pageHead = html.match(headRe)?.[0];
  const layoutHead = layoutHtml.match(headRe)?.[0];
  if (pageHead && layoutHead) {
    // Tolerera PAGE_TITLE/PAGE_DESCRIPTION-ersättningar men inget annat
    const normalize = s => s
      .replace(/<title>[^<]*<\/title>/, "<title></title>")
      .replace(/content="[^"]*"/g, 'content=""');
    if (normalize(pageHead) !== normalize(layoutHead))
      return { ok: false, reason: "head modifierad av polish" };
  }
  return { ok: true };
}
```

---

## Borttagen funktionalitet

### Cost tracking (fullt ut)

Ta bort följande från `claude-runner.js`:
- All `costUsd`-variabel-hantering
- All parsning av `result.cost_usd` från Claude output
- Alla "Kostnad X: $Y"-logg-rader

Ta bort från `routes/generate.js`:
- `costs`-objektet
- `writeFileSync(cost.json, ...)`
- Total kostnad-loggrad

### `brief.md` pipeline

Filen `flowing-ai/pipeline/brief.md` blir inaktuell (ersätts av `page-prompt.md`). Ta bort den eller behåll som referens — hellre ta bort för att undvika förvirring.

### `selections.json`

Skrivs inte längre. Används inte av något senare steg.

### `bilder/`-katalogen

Skapas inte längre. Ta bort alla `cpSync(bilderSrc, bilderDst)`-anrop i `claude-runner.js`. Ta bort `"../bilder/" → "./bilder/"` text-ersättningsloopen.

### `theme.json`, `prompt.md`, `recensioner.json` i outputen

Skapas inte längre av AI:n — allt är nu i `layout.html` och `strategy.json`.

---

## Edge cases

### Liten affär — bara index.html

Om strategin returnerar bara `index` i `pages[]`:
- Layout-passet kör ändå och producerar `layout.html`, men navbaren får bara "Hem"-länken
- Pipeline-passet kör bara för `index`
- Polish-passet kör bara för `index`
- Bildverifiering kör på bara en fil

Ingen nedbrytning — flödet fungerar identiskt.

### Sida failar i parallell körning

Om t.ex. `galleri.html` failar i sin pipeline:
- Jobbet fortsätter för övriga sidor
- Efter `Promise.all` tittar vi på resultaten — failed sidor loggas
- Vi post-processar alla lyckade HTML-filer och tar bort nav-länken till den failade sidan (annars har besökare en trasig länk)
- Om `index` failar: hela jobbet failar (eftersom det är landningssidan)

```js
const results = await Promise.all(pagePromises);
const failed = results.filter(r => r.failed).map(r => r.failed);
if (failed.includes("index")) throw new Error("Index-sidan misslyckades");
if (failed.length > 0) {
  log(`Misslyckade sidor: ${failed.join(", ")}`);
  await removeDeadNavLinks(siteDir, failed);
}
```

### Unsplash allow-list tom för businessType

Om `allowlist[businessType]` inte finns → fallback till `allowlist.default`. Om `default` också är tom → logga varning, lämna trasiga URL:er som är. Jobbet failar INTE bara för detta.

### Layout-passet producerar felaktig HTML

Om `verifyLayout()` kastar efter retry → hela jobbet failar via `runLayout`-rejection. Worker.ts får `POST /api/gen-jobs/{id}/fail` med felmeddelandet.

### Claude hänger tyst

Worker.ts-hang-detection slår till efter 40 min utan logg-uppdatering. Vid detektion:
- Försöker skicka `POST /api/gen-jobs/{id}/fail` till backend med hang-felet
- Lämnar Claude-processerna ifred (de kan inte adekvat kill:as från worker)
- Nästa körning pollar och kan ta nytt jobb

### Flera jobb i kö samtidigt

Worker.ts har redan en `processing`-flagga (`worker.ts:47`) som förhindrar överlappande jobbhantering. Det ändras inte — ett jobb i taget bearbetas av desktop-appen, parallelliseringen gäller bara inom ett jobb (per-sida-passes).

---

## Förutsättningar och infrastruktur

Det faktiska nuvarande produktionsflödet kör `run_locally` i `backend/lib/saleflow/workers/demo_generation_worker.ex` — alltså Claude CLI direkt från Elixir-backend med `backend/priv/demo_generation/brief.md` som enda brief. Flowing AI-flödet (desktop-app → flowing-ai-server) finns kodat men är avstängt via config-flaggan `use_genflow_jobs=false`.

Denna spec aktiverar Flowing AI-flödet. Det innebär att följande måste gälla i produktion:

### 1. Backend-flagga

- `backend/config/config.exs:48` — `use_genflow_jobs` ska vara `true` i default (eller via env-var i runtime)
- `backend/config/runtime.exs:27` — miljövariabel `USE_GENFLOW_JOBS=true` sätts i fly.io secrets
- Konsekvens: `DemoGenerationWorker.perform/1` kommer gå via `run_via_genflow()` istället för `run_locally()` för alla nya demo-jobb
- `run_locally()`-implementationen raderas INTE i denna spec — den finns kvar som fallback om vi behöver rollback snabbt

### 2. Desktop-appen måste köras

Genflow-local-server (Electron) måste köras 24/7 på maskinen som kör Flowing AI. Idag är det Douglas's Mac. Om Macen är avstängd eller appen inte startad → inga demos genereras och `GenerationJob`s staplar upp som `pending` tills nästa polling.

- Appen byggs med `electron-builder` (enligt `2026-04-08-genflow-local-server-design.md`)
- Config i `~/.genflow/config.json`:
  ```json
  {
    "backendUrl": "https://api.siteflow.se",
    "apiKey": "<X-GenFlow-Key>",
    "flowingAiUrl": "http://localhost:1337",
    "pollInterval": 5000
  }
  ```
- Appen pollar backend var 5:e sekund och plockar upp pending jobb

### 3. Flowing AI-servern måste köras

Flowing AI Node/Express-servern måste köras på `http://localhost:1337` på samma maskin som desktop-appen. Startas manuellt:

```
cd ~/dev/flowing-ai
npm start
```

(Eller via en launchd-agent för auto-start vid boot — utanför scope för denna spec men rekommenderas.)

### 4. Rate limits och Claude CLI

Användaren har bekräftat att Claude CLI-planen tillåter ~10 parallella körningar utan problem. Max simultana Claude-processer för ett jobb är `strategy.pages.length + 1` (alla sidor parallellt + polish överlappande), vilket i praktiken aldrig överskrider 5-6 samtidiga.

### 5. Befintlig data i `priv/static/demos/`

De existerande genererade demos som ligger i `backend/priv/static/demos/*/site/index.html` (från `run_locally`-flödet) rörs inte av denna migration. De fortsätter servas som idag via `preview_url: /demos/{id}/site/index.html`. Nya demos som genereras via Flowing AI-flödet får däremot `result_url` från Vercel deploy (t.ex. `https://slug.vercel.app`) och en vänligare `preview_url: https://demo.siteflow.se/{slug}`.

---

## Rollout

### Ordning

1. **Implementera alla flowing-ai-ändringar** (nya prompts, claude-runner, orkestrering, bildverifier, scraper-ändringar) på Douglas's Mac
2. **Testa lokalt** med en känd bokadirekt-URL direkt via flowing-ai API (utan att gå via backend):
   ```
   curl -X POST http://localhost:1337/api/scrape -d '{"url":"https://bokadirekt.se/places/darkbright-haircouture-47649"}'
   curl -X POST http://localhost:1337/api/generate -d '{"slug":"darkbright-haircouture-47649"}'
   ```
   Verifiera att alla förväntade sidor genereras och att layout.html är konsekvent
3. **Implementera worker.ts-ändringar** (hang-detection, förenklad request body)
4. **Paketera och installera** den uppdaterade desktop-appen på Douglas's Mac
5. **Starta desktop-appen och flowing-ai-servern** lokalt
6. **Slå på backend-flaggan** via fly.io secrets: `fly secrets set USE_GENFLOW_JOBS=true`
7. **Testa end-to-end** från Saleflow-dashboarden: skapa en demo via sales pipeline-flödet och verifiera att jobbet går via backend → GenerationJob → desktop-app → flowing-ai → Vercel deploy → tillbaka till backend
8. **Verifiera bildverifiering** genom att inspektera HTML-filer efter generering
9. **Verifiera hang-detection** — detta kan testas genom att tillfälligt stoppa Claude CLI mitt under ett jobb och vänta på att worker.ts rapporterar failure efter 40 min (eller tillfälligt sänka HANG_TIMEOUT_MS till 1 min i testfall)

### Rollback-strategi

Om Flowing AI-flödet visar sig instabilt eller har kvalitetsproblem:

- `fly secrets unset USE_GENFLOW_JOBS` → backend går tillbaka till `run_locally` omedelbart
- Inget annat behöver ändras — `run_locally`-koden är orörd
- Befintliga `GenerationJob`-rader i databasen kan stänga av via en migration eller manuellt

### Framtida cleanup (ej i scope)

När Flowing AI-flödet varit stabilt i produktion i minst 2 veckor kan följande tas bort:

- `run_locally()`-funktionen i `demo_generation_worker.ex`
- `backend/priv/demo_generation/brief.md`
- Config-flaggan `use_genflow_jobs` (bli alltid-på)
- `Saleflow.Workers.DemoGeneration.DefaultRunner`-modulen

Detta är INTE i scope för denna spec — det görs separat efter stabilitetsperiod.

---

## Sammanfattning av filändringar

### Nya filer

- `flowing-ai/pipeline/layout-prompt.md`
- `flowing-ai/pipeline/page-prompt.md`
- `flowing-ai/pipeline/unsplash-allowlist.json`
- `flowing-ai/server/lib/image-verifier.js`

### Ändrade filer (flowing-ai + desktop-app)

- `flowing-ai/pipeline/strategy-prompt.md` (omskriven för sidval)
- `flowing-ai/server/lib/claude-runner.js` (omskriven — nya funktioner, cost-tracking borttaget, kombinerad polish, Node-substitution av layout)
- `flowing-ai/server/routes/generate.js` (parallell orkestrering, ingen cost.json)
- `flowing-ai/server/routes/scrape.js` (ingen images-logik i response)
- `flowing-ai/scraper/scrape.py` (ingen bildnedladdning)
- `apps/genflow-local-server/src/worker.ts` (hang-detection, förenklad request body)

### Ändrade filer (saleflow backend — bara config/rollout)

- `backend/config/config.exs` — sätt `use_genflow_jobs` default till `true` (alternativt behålla `false` och istället sätta via env-var i prod)
- Fly.io secrets — sätta `USE_GENFLOW_JOBS=true`

### Orörda filer (viktigt — fallback)

- `backend/lib/saleflow/workers/demo_generation_worker.ex` — både `run_via_genflow` och `run_locally` behålls parallellt
- `backend/priv/demo_generation/brief.md` — orörd, fallback för `run_locally`
- `Saleflow.Workers.DemoGeneration.DefaultRunner` — orörd

### Raderade filer

- `flowing-ai/pipeline/brief.md` (ersatts av page-prompt.md)
