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
  ok: boolean
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
  // p-limit(3) i claude-runner.ts begränsar totalt antal samtidiga Claude-processer
  const results: JobResult[] = await Promise.all(
    strategy.pages.map(async (page): Promise<JobResult> => {
      try {
        await runPagePipeline(page, strategy, outputDir, log)
        renderPageFromLayout(page, strategy, outputDir)
        await runPolish(page, strategy, outputDir, log)
        return { slug: page.slug, ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`Sida ${page.slug} misslyckades: ${msg}`)
        return { slug: page.slug, ok: false, error: msg }
      }
    }),
  )

  // 5. Hantera failade sidor
  const failed = results.filter((r) => !r.ok).map((r) => r.slug)
  if (failed.includes('index')) {
    throw new Error('Index-sidan misslyckades — hela jobbet failar')
  }
  if (failed.length > 0) {
    log(`Misslyckade sidor: ${failed.join(', ')}`)
    await removeDeadNavLinks(outputDir, failed, log)
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
