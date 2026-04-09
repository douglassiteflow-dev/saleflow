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
    index: `OBLIGATORISKA SEKTIONER (i denna ordning, MINST dessa):
1. Hero — fullbred, stor Unsplash-bakgrundsbild, företagsnamn i stor typografi, tagline, primär CTA-knapp, optional betygsbadge
2. Intro — kort text (2-3 meningar) PLUS en dekorativ bild bredvid (2-kolumns layout med text + bild)
3. Featured tjänster — grid med 3-6 tjänster, tjänste-korten kan ha accent-bilder om det passar, men får också vara rena med typografi
4. Bildgalleri-teaser — valfritt, några bilder i asymmetriskt mosaic om det passar sidan
5. Recensioner — om mode är infinity-scroll: horisontell auto-scroll med duplicerade kort, pause on hover, 5-8 recensioner. Om mode är statiska-kort: 3 kort i grid.
6. Kontakt-CTA — fullbred sektion med bakgrundsbild eller gradient, text och primär CTA-knapp

BILDER: Flera bilder är bra för en service-sajt. Variera — hero, intro-bild, eventuell galleri-teaser, cta-bakgrund. Men inte på varje litet element — låt vissa sektioner andas med bara typografi och färg.

DESIGN-KRAV (pimp and polish — viktig):
- Hero måste ha gradient overlay för textläsbarhet
- Varje sektion ska kännas distinkt — alternerande bakgrundsfärger
- Dekorativa element: accent-linjer, dot-patterns, badge-ikoner, små detaljer
- Subtila hover-effekter på kort och knappar
- Använd CSS-variabler från layout för färgkonsistens`,

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
