import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { PIPELINE_DIR } from '../lib/platform'
import type { Strategy, LogFn } from '../lib/types'

interface ServiceRow {
  kategori?: string
  namn?: string
  pris_kr?: number | string
  tid_min?: number
}

interface BusinessData {
  namn?: string
  meta_beskrivning?: string
  om_oss?: string
  adress?: { streetAddress?: string; postalCode?: string; addressLocality?: string }
  telefon?: string
  epost?: string
  öppettider?: Record<string, string>
  personal?: Array<{ namn?: string; titel?: string }>
  tjänster?: ServiceRow[]
  betyg?: { reviewCount?: number; ratingValue?: number }
  recensioner?: unknown[]
  image_urls?: string[]
}

/**
 * Bygger en kompakt, prompt-vänlig sammanfattning av företagsdata.
 * Istället för att klippa rå JSON (som kan missa tjänste-array om personal-fältet
 * är stort) extraherar vi bara de fält strategin behöver och räknar aggregat.
 */
function buildBusinessSummary(data: BusinessData): string {
  const services = data.tjänster ?? []
  const categories = [...new Set(services.map((s) => s.kategori).filter(Boolean))] as string[]
  const personal = data.personal ?? []
  const reviewCount = data.betyg?.reviewCount ?? data.recensioner?.length ?? 0
  const hasAddress = !!data.adress?.streetAddress
  const hasPhone = !!data.telefon
  const hasHours = !!data.öppettider && Object.keys(data.öppettider).length > 0
  const hasOmOss = (data.om_oss ?? '').length > 50

  // Topp-5 tjänster per kategori för smakprov
  const servicesByCategory: Record<string, ServiceRow[]> = {}
  for (const s of services) {
    const k = s.kategori ?? 'Okategoriserad'
    servicesByCategory[k] ??= []
    servicesByCategory[k].push(s)
  }
  const serviceSample = Object.entries(servicesByCategory)
    .map(([cat, items]) => {
      const sample = items
        .slice(0, 5)
        .map((s) => `- ${s.namn}${s.pris_kr ? ` (${s.pris_kr} kr)` : ''}`)
        .join('\n')
      return `### ${cat} (${items.length} tjänster)\n${sample}`
    })
    .join('\n\n')

  return `## Namn
${data.namn ?? 'Okänt'}

## Beskrivning
${data.meta_beskrivning ?? ''}

## Om oss
${(data.om_oss ?? '').slice(0, 500)}

## Aggregerat
- Antal tjänster: **${services.length}**
- Antal kategorier: **${categories.length}** (${categories.join(', ')})
- Antal personal: **${personal.length}**
- Antal recensioner: **${reviewCount}**
- Har adress: ${hasAddress ? 'ja' : 'nej'}
- Har telefon: ${hasPhone ? 'ja' : 'nej'}
- Har öppettider: ${hasHours ? 'ja' : 'nej'}
- Har om_oss-text (>50 tecken): ${hasOmOss ? 'ja' : 'nej'}

## Tjänster (smakprov per kategori)
${serviceSample || '(inga tjänster extraherades)'}
`
}

export async function runStrategy(outputDir: string, log: LogFn): Promise<Strategy> {
  log('Strategisk analys startad...')

  const dataPath = join(outputDir, 'företagsdata.json')
  if (!existsSync(dataPath)) {
    throw new Error(`Företagsdata saknas: ${dataPath}`)
  }
  const rawData = readFileSync(dataPath, 'utf-8')
  let parsed: BusinessData
  try {
    parsed = JSON.parse(rawData) as BusinessData
  } catch (err) {
    throw new Error(`Kunde inte parsa företagsdata.json: ${(err as Error).message}`)
  }
  const businessData = buildBusinessSummary(parsed)

  const templatePath = join(PIPELINE_DIR, 'strategy-prompt.md')
  const template = readFileSync(templatePath, 'utf-8')
  const prompt = template.replace('$BUSINESS_DATA', businessData)

  const stdout = await runClaude({
    args: [
      '--dangerously-skip-permissions',
      '-p', prompt,
      '--output-format', 'json',
    ],
    cwd: outputDir,
    log,
  })

  const strategy = parseStrategyResult(stdout)
  const strategyPath = join(outputDir, 'strategy.json')
  writeFileSync(strategyPath, JSON.stringify(strategy, null, 2))

  log(`Strategi klar — ${strategy.pages.length} sidor, ${strategy.services.total} tjänster`)
  return strategy
}

function parseStrategyResult(stdout: string): Strategy {
  // Claude --output-format json returnerar en JSON-array av messages.
  // Det sista meddelandet har type="result" med ett "result"-fält.
  try {
    const messages = JSON.parse(stdout)
    if (Array.isArray(messages)) {
      const resultMsg = messages.find((m) => m.type === 'result' && m.result)
      if (resultMsg) {
        let text: string = resultMsg.result
        // Strippa eventuella markdown code-blocks
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        const match = text.match(/\{[\s\S]*"reasoning"[\s\S]*\}/)
        if (match) {
          return JSON.parse(match[0]) as Strategy
        }
      }
    }
  } catch {
    // fall through
  }

  // Fallback: försök extrahera från rå stdout
  const cleaned = stdout.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  const match = cleaned.match(/\{"reasoning"[\s\S]*?"categoryOrder"\s*:\s*\[[^\]]*\]\s*\}\s*\}/)
  if (match) {
    return JSON.parse(match[0]) as Strategy
  }

  throw new Error('Kunde inte parsa strategi-JSON från Claude output')
}
