import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { PIPELINE_DIR, SKILLS_DIR } from '../lib/platform'
import type { PageSpec, Strategy, LogFn } from '../lib/types'

export async function runPagePipeline(
  pageSpec: PageSpec,
  strategy: Strategy,
  outputDir: string,
  log: LogFn,
): Promise<void> {
  log(`Sid-pipeline startad: ${pageSpec.slug}`)

  // Se till att pages/ finns
  mkdirSync(join(outputDir, 'pages'), { recursive: true })

  const dataPath = join(outputDir, 'företagsdata.json')
  const businessData = readFileSync(dataPath, 'utf-8').slice(0, 2000)

  const layoutPath = join(outputDir, 'layout.html')
  const contentPath = join(outputDir, 'pages', `${pageSpec.slug}.content.html`)

  const templatePath = join(PIPELINE_DIR, 'page-prompt.md')
  const template = readFileSync(templatePath, 'utf-8')

  const pageContext = buildPageContext(pageSpec, strategy, outputDir)
  const pageTypeRules = getPageTypeRules(pageSpec.slug)

  const prompt = template
    .replaceAll('$PAGE_SLUG', pageSpec.slug)
    .replace('$PAGE_FILENAME', pageSpec.filename)
    .replace('$BUSINESS_DATA', businessData)
    .replace('$STRATEGY', JSON.stringify(strategy, null, 2))
    .replace('$PAGE_CONTEXT', pageContext)
    .replace('$PAGE_SECTIONS', JSON.stringify(pageSpec.sections))
    .replace('$LAYOUT_PATH', layoutPath)
    .replace('$CONTENT_PATH', contentPath)
    .replace('$PAGE_TYPE_RULES', pageTypeRules)

  await runClaude({
    args: [
      '--dangerously-skip-permissions',
      '--add-dir', SKILLS_DIR,
      '-p', prompt,
      '--output-format', 'stream-json',
    ],
    cwd: outputDir,
    log,
    onLine: (line) => {
      try {
        const msg = JSON.parse(line) as { type?: string; message?: { content?: Array<{ type: string; name?: string }> } }
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_use' && block.name) {
              log(`[${pageSpec.slug}] ${block.name}...`)
            }
          }
        }
      } catch {
        // ignore
      }
    },
  })

  if (!existsSync(contentPath)) {
    throw new Error(`Sidan ${pageSpec.slug} producerade inget content-fragment`)
  }

  log(`Sid-pipeline klar: ${pageSpec.slug}`)
}

function buildPageContext(pageSpec: PageSpec, strategy: Strategy, outputDir: string): string {
  const dataPath = join(outputDir, 'företagsdata.json')
  const data = JSON.parse(readFileSync(dataPath, 'utf-8'))

  switch (pageSpec.slug) {
    case 'index':
      return [
        `Featured tjänster: ${JSON.stringify(strategy.services.featuredForIndex)}`,
        `Recensions-mode: ${strategy.reviews.displayMode}`,
        `Antal recensioner: ${strategy.reviews.total}`,
        `Exempel-recensioner: ${JSON.stringify((data.recensioner ?? []).slice(0, 8))}`,
      ].join('\n')
    case 'tjanster':
      return [
        `Alla tjänster: ${JSON.stringify(data.tjänster ?? [])}`,
        `Kategoriordning: ${JSON.stringify(strategy.services.categoryOrder)}`,
      ].join('\n')
    case 'om-oss':
      return [
        `Om oss-text: ${data.om_oss ?? data.beskrivning ?? ''}`,
        `Personal (nämns som text): ${JSON.stringify(data.personal ?? [])}`,
      ].join('\n')
    case 'galleri':
      return `Unsplash-teman: ${JSON.stringify(strategy.gallery.themes)}`
    case 'kontakt':
      return [
        `Adress: ${data.adress ?? ''}`,
        `Telefon: ${data.telefon ?? ''}`,
        `Email: ${data.epost ?? data.email ?? ''}`,
        `Öppettider: ${JSON.stringify(data.öppettider ?? data.oppettider ?? {})}`,
      ].join('\n')
    default:
      return ''
  }
}

function getPageTypeRules(slug: string): string {
  const rules: Record<string, string> = {
    index: `SEKTIONSORDNING — MAX 7 SEKTIONER (byggd enligt konverteringsforskning för lokala tjänsteföretag):

1. Hero
   - Rubrik: MAX 10 ord, 48-72px desktop / 32-42px mobile, line-height 1.1-1.2
   - Underrubrik: MAX 25 ord, 18-22px desktop
   - EXAKT EN primär CTA above the fold: "Boka tid" (säker) eller "Se lediga tider" (mjukare)
   - CTA min 48x48px, padding 32x16
   - Betygsbadge (stjärnor + antal + källa) inom 200px från CTA — MYCKET VIKTIGT
   - Hero-bakgrund: EN stor Unsplash-bild med gradient overlay
   - INGA dekorativa blobbar/patterns/shapes INUTI hero (håll heron ren)
   - Allt above the fold (<=90vh): logo, nav, rubrik, underrubrik, CTA, betyg, bild

2. Social proof bar (slim 60-100px)
   - Stjärnor + antal recensioner + källa ("4.9 av 5 · 1103 omdömen på Bokadirekt")
   - Suppress count om <20, visa tydligt om >100
   - Hoppa över denna sektion om total recensioner <5

3. Featured tjänster
   - EXAKT 3 eller 6 kort — ALDRIG 4 eller 5 (tiler inte rent i responsiv grid)
   - Välj från strategy.services.featuredForIndex
   - Varje kort: namn, kort beskrivning, pris, subtil hover-effekt
   - Tjänste-kort behöver ej individuella bilder — rena kort med stark typografi funkar
   - Left-aligned headline ovanför grid (F-pattern)

4. Om oss / Differentiator
   - MAX 2-3 meningar — inga "walls of text" (paragraf <80 ord)
   - 1 bild av lokaltyp/miljö bredvid texten (2-kolumns layout)

5. Recensioner
   - Om >3 recensioner: infinity-scroll med pause on hover
   - Om <=3: 3 statiska kort i F-pattern
   - Varje kort: namn + område ("Anna, Vasastan"), aldrig anonym
   - Subtil källa-citering (Bokadirekt/Google)

6. Kontakt/plats
   - Clickable karta (iframe) + klickbara öppettider + phone som tel: link + adress
   - Small, funktional sektion

7. Final CTA
   - STOR fullbred sektion, bakgrundsbild eller gradient
   - SAMMA primär CTA som i heron (repetition: exakt 2-3 gånger totalt på sidan)

FÖRBJUDET:
- Separat intro/welcome-sektion mellan hero och services
- Team-grid med personalporträtt (aldrig)
- Process/how-it-works (utom om tjänsten genuint har 3+ steg kunden bryr sig om)
- MER än 7 sektioner
- Hero-formulär above the fold (booking-form kommer efter klick)
- "Kontakta oss" eller "Läs mer" som primär CTA
- Carousels som auto-roterar <7s
- Flera konkurrerande primära CTA:er

BILDER: Totalt 5-9 bilder på sidan. Fördelning: 1 hero, 0-6 på servicekort (valfritt), 1-2 about/interior, 0-1 dekorativ accent.

DESIGN: Använd CSS-variabler från layout. Subtila hover-effekter. F-pattern för services/testimonials (left-aligned headlines). Z-pattern för hero.`,

    tjanster: `- Rubriksektion "Våra tjänster" med stor Unsplash-hero eller gradient
- Grupperade per kategori i strategy.services.categoryOrder
- Varje tjänst-kort: namn, beskrivning, pris, varaktighet + liten accent-bild eller ikon
- ALLA tjänster från företagsdata.json
- Separatorer mellan kategorier (SVG divider eller färgad bar)
- Hover-effekter på korten`,

    'om-oss': `- Hero med stor Unsplash-bild och kort beskrivning
- 2-kolumns sektion: text + bild för historia/värderingar
- Personal som TEXT-block (ingen team-grid)
- MINST 2-3 Unsplash-bilder av lokaltyp spridda i sektionerna
- CTA-sektion längst ner`,

    galleri: `- Bento-grid layout (variarade cell-storlekar — några stora, några små, asymmetriskt)
- 8-12 Unsplash-bilder från strategy.gallery.themes
- ALDRIG infinity-scroll eller carousel
- Hover-effekter med zoom + overlay
- Kort rubriksektion ovanför grid:en`,

    kontakt: `- Hero-sektion med stor bakgrundsbild och rubrik
- 2-kolumns layout: kontaktformulär (rent visuellt, action="#") bredvid info-kort
- Info-kort: adress, telefon, email, öppettider (snyggt formaterat)
- Google Maps iframe om adress finns
- Bakgrundsbild eller gradient på heron`,
  }
  return rules[slug] ?? ''
}
