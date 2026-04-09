import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runScrape } from './pipeline/scrape'
import { runStrategy } from './pipeline/strategy'
import { runLayout } from './pipeline/layout'
import { runPagePipeline } from './pipeline/page'
import { runPolish } from './pipeline/polish'
import { verifyAllImages } from './image-verifier'
import { renderPageFromLayout } from './lib/layout-substitution'
import type { GenJob, LogFn } from './lib/types'

interface JobResult {
  slug: string
  /** true om sidan renderades till site/<filename> (även om polish senare failade) */
  rendered: boolean
  /** true om polishen slutfördes utan fel (kosmetisk, inte fatal) */
  polished: boolean
  error?: string
}

export async function runJob(
  job: GenJob,
  log: LogFn,
): Promise<{ outputDir: string; siteDir: string }> {
  log(`=== Jobb startat: ${job.slug} ===`)

  // 1. Scrape
  const outputDir = await runScrape(job.source_url, job.slug, log)

  // 2. Strategy (sekventiellt)
  const strategy = await runStrategy(outputDir, log)

  // 3. Layout (sekventiellt, delad mall)
  await runLayout(strategy, outputDir, log)

  // 4. Parallell per-sida pipeline + polish
  // Viktigt: polish är KOSMETISK. Om pipeline+render lyckas räknas sidan
  // som OK — även om polish-passet sedan kraschar/timeout:ar. Sidan finns
  // på disk och nav-länken ska INTE tas bort.
  const results: JobResult[] = await Promise.all(
    strategy.pages.map(async (page): Promise<JobResult> => {
      try {
        await runPagePipeline(page, strategy, outputDir, log)
        renderPageFromLayout(page, strategy, outputDir)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`Sida ${page.slug} misslyckades i pipeline/render: ${msg}`)
        return { slug: page.slug, rendered: false, polished: false, error: msg }
      }

      // Pipeline + render klart → sidan finns på disk. Polish är best-effort.
      try {
        await runPolish(page, strategy, outputDir, log)
        return { slug: page.slug, rendered: true, polished: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`Polish misslyckades för ${page.slug} (sidan behålls opolerad): ${msg}`)
        return { slug: page.slug, rendered: true, polished: false, error: msg }
      }
    }),
  )

  // 5. Hantera failade sidor — BARA om pipeline/render failade, inte polish
  const failedToRender = results.filter((r) => !r.rendered).map((r) => r.slug)
  if (failedToRender.includes('index')) {
    throw new Error('Index-sidan misslyckades — hela jobbet failar')
  }
  if (failedToRender.length > 0) {
    log(`Sidor utan HTML (dead nav): ${failedToRender.join(', ')}`)
    await removeDeadNavLinks(outputDir, failedToRender, log)
  }
  const polishFailed = results.filter((r) => r.rendered && !r.polished).map((r) => r.slug)
  if (polishFailed.length > 0) {
    log(`Opolerade sidor (behålls i nav): ${polishFailed.join(', ')}`)
  }

  // 6. Bildverifiering
  await verifyAllImages(outputDir, strategy.businessType, log)

  const siteDir = join(outputDir, 'site')
  log(`=== Jobb klart: ${job.slug} ===`)
  return { outputDir, siteDir }
}

async function removeDeadNavLinks(
  outputDir: string,
  failedSlugs: string[],
  log: LogFn,
): Promise<void> {
  const siteDir = join(outputDir, 'site')
  if (!existsSync(siteDir)) return

  const htmlFiles = readdirSync(siteDir).filter((f) => f.endsWith('.html'))

  for (const file of htmlFiles) {
    const path = join(siteDir, file)
    let html = readFileSync(path, 'utf-8')
    let removed = 0

    for (const slug of failedSlugs) {
      // Ta bort <a>-taggen med data-page="<slug>"
      const re = new RegExp(`<a[^>]*data-page=["']${slug}["'][^>]*>[\\s\\S]*?<\\/a>`, 'g')
      const matches = html.match(re)
      if (matches) {
        removed += matches.length
        html = html.replace(re, '')
      }
    }

    if (removed > 0) {
      writeFileSync(path, html)
      log(`${file}: tog bort ${removed} döda nav-länkar`)
    }
  }
}
