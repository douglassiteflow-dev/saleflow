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
    index: `- Hero med företagsnamn, tagline, primär CTA, Unsplash-bakgrundsbild
- Kort intro (2-3 meningar)
- Featured tjänster-grid (bara strategy.services.featuredForIndex)
- Om recensions-mode är infinity-scroll: horisontell auto-scroll, duplicerade kort, pause on hover, 5-8 recensioner
- Om recensions-mode är statiska-kort: 3 kort i grid
- Kontakt-CTA-sektion med adress, telefon, knapp`,

    tjanster: `- Rubriksektion "Våra tjänster"
- Grupperade per kategori i strategy.services.categoryOrder
- Varje tjänst: namn, beskrivning, pris, varaktighet
- ALLA tjänster från företagsdata.json
- Strukturerad layout (inte kort med bakgrundsbilder)`,

    'om-oss': `- Hero med kort beskrivning
- Historia/värderingar från om_oss-text
- Personal som TEXT (ingen team-grid)
- Eventuell Unsplash-bild av lokaltyp`,

    galleri: `- Bento-grid layout (variarade cell-storlekar)
- 8-12 Unsplash-bilder från strategy.gallery.themes
- ALDRIG infinity-scroll eller carousel
- Hover-effekter tillåtna`,

    kontakt: `- Kontaktformulär (rent visuellt, action="#")
- Adress, telefon, email
- Öppettider som tabell
- Google Maps iframe om adress finns`,
  }
  return rules[slug] ?? ''
}
