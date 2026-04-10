import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runScrape } from './scrape'
import { runClaude } from '../claude-runner'
import { OUTPUT_DIR } from '../lib/platform'
import type { GenJob, LogFn } from '../lib/types'

const DESCRIPTION_PROMPT = `Du är en dataextraherare. Utifrån följande beskrivning av ett företag, skapa en komplett företagsdata-JSON.

## Beskrivning

$DESCRIPTION

## Krav

Returnera ENBART en JSON-objekt (ingen markdown, inga code-blocks) med denna struktur:

{
  "namn": "Företagsnamn",
  "meta_beskrivning": "Kort beskrivning för SEO",
  "om_oss": "Längre beskrivning av företaget...",
  "adress": { "streetAddress": "", "postalCode": "", "addressLocality": "" },
  "telefon": "",
  "epost": "",
  "öppettider": {},
  "tjänster": [
    { "kategori": "Kategori", "namn": "Tjänstnamn", "pris_kr": 0, "tid_min": 0 }
  ],
  "betyg": { "reviewCount": 0, "ratingValue": 0 },
  "personal": []
}

Fyll i så mycket som möjligt baserat på beskrivningen. Hitta inte på kontaktuppgifter — lämna tomma fält om de inte nämns. Tjänster och priser som nämns ska inkluderas. Om inga tjänster nämns, skapa rimliga tjänster baserat på verksamhetstypen.`

const WEBSITE_PROMPT = `Du är en dataextraherare. Jag ger dig en URL till ett företags hemsida. Använd WebSearch eller WebFetch för att besöka sidan och extrahera all relevant information.

## URL

$URL

## Instruktioner

1. Besök hemsidan och eventuella undersidor (om-oss, tjänster, kontakt)
2. Extrahera all företagsinformation du hittar
3. Returnera ENBART en JSON-objekt (ingen markdown, inga code-blocks) med denna struktur:

{
  "namn": "Företagsnamn",
  "meta_beskrivning": "Kort beskrivning för SEO",
  "om_oss": "Längre beskrivning...",
  "adress": { "streetAddress": "", "postalCode": "", "addressLocality": "" },
  "telefon": "",
  "epost": "",
  "öppettider": {},
  "tjänster": [
    { "kategori": "Kategori", "namn": "Tjänstnamn", "pris_kr": 0, "tid_min": 0 }
  ],
  "betyg": { "reviewCount": 0, "ratingValue": 0 },
  "personal": []
}

Fyll i allt du hittar. Lämna tomma fält om informationen inte finns på sidan.`

function extractJson(stdout: string): string {
  // Claude --output-format json returnerar en array av messages
  try {
    const messages = JSON.parse(stdout)
    if (Array.isArray(messages)) {
      const resultMsg = messages.find((m: { type?: string; result?: string }) => m.type === 'result' && m.result)
      if (resultMsg) {
        let text: string = resultMsg.result
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        const match = text.match(/\{[\s\S]*\}/)
        if (match) return match[0]
      }
    }
  } catch {
    // fall through
  }
  // Fallback
  const cleaned = stdout.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) return match[0]
  throw new Error('Kunde inte extrahera JSON från Claude-output')
}

export async function resolveSource(job: GenJob, log: LogFn): Promise<string> {
  const sourceType = job.source_type ?? 'bokadirekt'

  if (sourceType === 'bokadirekt') {
    return runScrape(job.source_url, job.slug, log)
  }

  // Skapa output-katalog
  const outputDir = join(OUTPUT_DIR, job.slug)
  mkdirSync(outputDir, { recursive: true })

  if (sourceType === 'description') {
    log('Skapar företagsdata från beskrivning...')
    const prompt = DESCRIPTION_PROMPT.replace('$DESCRIPTION', job.source_text ?? '')

    const stdout = await runClaude({
      args: ['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'json'],
      cwd: outputDir,
      log,
    })

    const json = extractJson(stdout)
    // Validera att det är giltig JSON
    JSON.parse(json)
    writeFileSync(join(outputDir, 'företagsdata.json'), json)
    log('Företagsdata skapad från beskrivning')
    return outputDir
  }

  if (sourceType === 'website') {
    log(`Extraherar företagsdata från hemsida: ${job.source_url}`)
    const prompt = WEBSITE_PROMPT.replace('$URL', job.source_url)

    const stdout = await runClaude({
      args: ['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'json'],
      cwd: outputDir,
      log,
    })

    const json = extractJson(stdout)
    JSON.parse(json)
    writeFileSync(join(outputDir, 'företagsdata.json'), json)
    log('Företagsdata extraherad från hemsida')
    return outputDir
  }

  throw new Error(`Okänd source_type: ${sourceType}`)
}
