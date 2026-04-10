import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveSource } from './pipeline/source'
import { getColorPalette } from './pipeline/design'
import { runClaude } from './claude-runner'
import { runReview } from './pipeline/review'
import { runCreativePass } from './pipeline/creative-pass'
import { runFinalReview } from './pipeline/final-review'
import { runLifePass } from './pipeline/life-pass'
import { sanitizeSwedishHtml } from './lib/layout-substitution'
import { PIPELINE_DIR, SKILLS_DIR } from './lib/platform'
import type { GenJob, LogFn } from './lib/types'

export async function runJob(
  job: GenJob,
  log: LogFn,
): Promise<{ outputDir: string; siteDir: string }> {
  log(`=== Jobb startat: ${job.slug} (${job.source_type ?? 'bokadirekt'}) ===`)

  // 1. Resolve source → företagsdata.json + bilder/
  const outputDir = await resolveSource(job, log)
  const siteDir = join(outputDir, 'site')
  mkdirSync(siteDir, { recursive: true })

  // 2. Läs företagsdata
  const dataPath = join(outputDir, 'företagsdata.json')
  if (!existsSync(dataPath)) throw new Error(`Företagsdata saknas: ${dataPath}`)
  const businessDataRaw = readFileSync(dataPath, 'utf-8')

  // 3. Samla bilder
  const bilderDir = join(outputDir, 'bilder')
  let selectedImages: string[] = []
  if (existsSync(bilderDir)) {
    selectedImages = readdirSync(bilderDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
  }
  const imageList = selectedImages.map(img => `- ${img}`).join('\n')

  // 4. Samla alla tjänster
  let allServices: Array<{ namn?: string; kategori?: string; pris_kr?: number; tid_min?: number }> = []
  try {
    const data = JSON.parse(businessDataRaw)
    allServices = data.tjänster ?? []
  } catch { /* ignore */ }

  const allServiceList = allServices.map(s =>
    `- ${s.namn} (${s.pris_kr ?? '?'} kr, ${s.tid_min ?? '?'} min)`
  ).join('\n') || 'Alla tjänster från företagsdata.json'

  // 5. Samla recensioner
  let reviewsContent = 'No reviews available — skip the reviews section.'
  const reviewsPath = join(outputDir, 'recensioner.json')
  if (existsSync(reviewsPath)) {
    try {
      const reviewsData = JSON.parse(readFileSync(reviewsPath, 'utf-8'))
      if (reviewsData.recensioner?.length > 0) {
        const lines = reviewsData.recensioner.map((r: { namn?: string; betyg?: number; datum?: string; text?: string }) =>
          `- ${r.namn} (${r.betyg}★, ${r.datum?.slice(0, 10) ?? ''}): "${r.text}"`
        )
        const summary = `Average rating: ${reviewsData.snittbetyg ?? 'N/A'}/5 (${reviewsData.antal_recensioner ?? 0} total reviews)`
        reviewsContent = summary + '\n\n' + lines.join('\n')
      }
    } catch { /* ignore */ }
  }

  // 6. Strategy (separat Claude-anrop — analyserar bilder med vision)
  let strategyContent = 'Ingen strategi tillgänglig — använd eget omdöme för layout och tjänsteurval.'
  let imageDescriptions = 'No descriptions provided — analyze the images yourself.'
  let featuredServiceList = allServiceList  // Fallback: alla tjänster

  try {
    log('Strategisk analys startad...')
    const strategyTemplate = readFileSync(join(PIPELINE_DIR, 'strategy-prompt.md'), 'utf-8')
    const categories = [...new Set(allServices.map(s => s.kategori).filter(Boolean))]
    const strategyPrompt = strategyTemplate
      .replace('$BUSINESS_DATA', businessDataRaw.slice(0, 2000))
      .replace('$SERVICE_COUNT', String(allServices.length))
      .replace('$CATEGORY_COUNT', String(categories.length))
      .replace('$SERVICES', allServiceList)
      .replace('$IMAGE_COUNT', String(selectedImages.length))
      .replace('$IMAGES_DIR', bilderDir)
      .replace('$IMAGE_FILES', imageList || 'Inga bilder')

    const strategyStdout = await runClaude({
      args: ['-p', strategyPrompt, '--output-format', 'json', '--dangerously-skip-permissions'],
      cwd: outputDir,
      log,
    })

    // Parse strategy
    try {
      const messages = JSON.parse(strategyStdout)
      if (Array.isArray(messages)) {
        const resultMsg = messages.find((m: { type?: string; result?: string }) => m.type === 'result' && m.result)
        if (resultMsg) {
          let text: string = resultMsg.result
          text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
          const match = text.match(/\{[\s\S]*"reasoning"[\s\S]*\}/)
          if (match) {
            const strategy = JSON.parse(match[0])
            writeFileSync(join(outputDir, 'strategy.json'), JSON.stringify(strategy, null, 2))
            strategyContent = JSON.stringify(strategy, null, 2)

            // Extrahera bildbeskrivningar
            if (strategy.imageClassifications?.length > 0) {
              imageDescriptions = strategy.imageClassifications
                .map((d: { file: string; category: string; description: string }) => `- ${d.file} [${d.category}]: ${d.description}`)
                .join('\n')
            }

            // Filtrera tjänster till bara featured (fix #6)
            if (strategy.services?.featured?.length > 0) {
              const featuredNames = new Set(
                strategy.services.featured.map((f: { namn: string }) => f.namn.toLowerCase())
              )
              const filtered = allServices.filter(s => featuredNames.has(s.namn?.toLowerCase() ?? ''))
              if (filtered.length > 0) {
                featuredServiceList = filtered.map(s =>
                  `- ${s.namn} (${s.pris_kr ?? '?'} kr, ${s.tid_min ?? '?'} min)`
                ).join('\n')
                log(`Filtrerade till ${filtered.length} featured tjänster (av ${allServices.length} totalt)`)
              }
            }

            log(`Strategi klar — ${strategy.services?.featuredCount ?? '?'} featured tjänster`)
          }
        }
      }
    } catch { /* ignore */ }
  } catch (err) {
    log(`Strategi misslyckades (fortsätter utan): ${(err as Error).message}`)
  }

  // 7. Färgpalett (v4.10.2: från logga/kund, annars Claude väljer)
  const colorPalette = getColorPalette()

  // 8. Bygg brief (exakt v4.10.2)
  const briefTemplate = readFileSync(join(PIPELINE_DIR, 'brief.md'), 'utf-8')
  const brief = briefTemplate
    .replaceAll('$OUTPUT_DIR', outputDir)
    .replace('$LOGO_URL', 'No logo provided — skip logo placement.')
    .replace('$COLOR_PALETTE', colorPalette)
    .replace('$IMAGE_DESCRIPTIONS', imageDescriptions)
    .replace('$SELECTED_IMAGES', imageList || 'Inga bilder valda — använd Unsplash stock')
    .replace('$SELECTED_SERVICES', featuredServiceList)
    .replace('$REVIEWS', reviewsContent)
    .replace('$STRATEGY', strategyContent)
    .replace('$BOOKING_URL', job.source_url ?? '#')

  const briefPath = join(outputDir, 'brief.md')
  writeFileSync(briefPath, brief)

  // 9. GENERATE — Claude med brief + skills
  log('Pipeline startad — Startar Claude Code...')
  const generatePrompt = `Read and follow the brief at ${briefPath} exactly. Do not ask questions, just execute each step.`

  await runClaude({
    args: [
      '--dangerously-skip-permissions',
      '--add-dir', SKILLS_DIR,
      '-p', generatePrompt,
      '--output-format', 'stream-json',
    ],
    cwd: outputDir,
    log,
    onLine: (line) => {
      try {
        const msg = JSON.parse(line) as { type?: string; message?: { content?: Array<{ type: string; name?: string; text?: string }> } }
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_use' && block.name) {
              log(`  Använder ${block.name}...`)
            } else if (block.type === 'text' && block.text && block.text.length > 10) {
              log(block.text.slice(0, 150))
            }
          }
        }
      } catch { /* ignore */ }
    },
  })

  // Verifiera
  const indexPath = join(siteDir, 'index.html')
  if (!existsSync(indexPath)) {
    log('Claude avslutades men ingen index.html skapades')
    throw new Error('site/index.html saknas')
  }
  log('Hemsida genererad!')

  // Kopiera bilder till site/bilder/
  if (existsSync(bilderDir)) {
    const bilderDst = join(siteDir, 'bilder')
    try { cpSync(bilderDir, bilderDst, { recursive: true }) } catch { /* ignore */ }
  }

  // Fix image paths: ../bilder/ → ./bilder/
  for (const file of readdirSync(siteDir).filter(f => f.endsWith('.html'))) {
    const filePath = join(siteDir, file)
    let html = readFileSync(filePath, 'utf-8')
    if (html.includes('../bilder/')) {
      html = html.replaceAll('../bilder/', './bilder/')
      writeFileSync(filePath, html)
    }
  }

  // 10. REVIEW — kvalitetsgranskning (exakt v4.10.2)
  try {
    await runReview(outputDir, log)
  } catch (err) {
    log(`Review misslyckades (fortsätter): ${(err as Error).message}`)
  }

  // 11. CREATIVE PASS — kreativ polish (exakt v4.10.2)
  try {
    await runCreativePass(outputDir, log)
  } catch (err) {
    log(`Creative pass misslyckades (fortsätter): ${(err as Error).message}`)
  }

  // 12. FINAL REVIEW — teknisk slutkontroll (bilder, ÅÄÖ, trasiga element)
  try {
    await runFinalReview(outputDir, log)
  } catch (err) {
    log(`Final review misslyckades (fortsätter): ${(err as Error).message}`)
  }

  // 13. LIFE PASS — djup kreativ polish (shapes, motions, djup, detaljer — obegränsad tid)
  try {
    await runLifePass(outputDir, log)
  } catch (err) {
    log(`Life pass misslyckades (fortsätter): ${(err as Error).message}`)
  }

  // 14. Sanitize (ÅÄÖ, emojis — sista steget, fångar allt)
  const finalHtml = readFileSync(indexPath, 'utf-8')
  const sanitized = sanitizeSwedishHtml(finalHtml)
  if (sanitized !== finalHtml) {
    writeFileSync(indexPath, sanitized, 'utf-8')
    log('Saniterad (ÅÄÖ/emojis)')
  }

  log(`=== Jobb klart: ${job.slug} ===`)
  return { outputDir, siteDir }
}
