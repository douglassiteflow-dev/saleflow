import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { resolveScraperCommand, OUTPUT_DIR } from '../lib/platform'
import type { LogFn } from '../lib/types'

// Scraper extraherar sin egen slug från URL:en (sista path-segmentet) och
// skriver till OUTPUT_DIR/<scraperSlug>/. För test-jobb är vår slug
// "test-...-<timestamp>" men scraper skriver fortfarande till den raka slug:en.
// Vi parsa:r URL:en på samma sätt så vi vet var scraper landar.
function getScraperSlug(url: string): string {
  try {
    const path = new URL(url).pathname
    const parts = path.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? ''
  } catch {
    return ''
  }
}

export async function runScrape(sourceUrl: string, slug: string, log: LogFn): Promise<string> {
  log(`Scrape startat: ${sourceUrl}`)

  const scraperSlug = getScraperSlug(sourceUrl)
  if (!scraperSlug) {
    throw new Error(`Kunde inte extrahera slug från URL: ${sourceUrl}`)
  }

  // Final destination dir (the slug we asked for, t.ex. "test-foo-12345")
  const finalDir = join(OUTPUT_DIR, slug)
  // Where the scraper actually writes
  const scraperDir = join(OUTPUT_DIR, scraperSlug)

  mkdirSync(OUTPUT_DIR, { recursive: true })

  const { cmd, args } = resolveScraperCommand()

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args(sourceUrl), {
      cwd: OUTPUT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    proc.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) log(`[scrape] ${line.trim()}`)
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) log(`[scrape err] ${text.slice(0, 200)}`)
    })

    proc.on('error', (err) => reject(err))
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`scrape exit code ${code}`))
    })
  })

  const scraperDataPath = join(scraperDir, 'företagsdata.json')
  if (!existsSync(scraperDataPath)) {
    throw new Error(`Scrape producerade ingen företagsdata.json i ${scraperDir}`)
  }

  // Om scraper-katalog och slutkatalog är samma → klart
  if (scraperDir === finalDir) {
    log(`Scrape klar: ${finalDir}`)
    return finalDir
  }

  // Annars: kopiera scraper output till final dir så downstream-funktioner
  // kan skriva strategy.json/layout.html/site/ etc i samma katalog.
  if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true })
  cpSync(scraperDir, finalDir, { recursive: true })
  log(`Scrape klar: ${finalDir} (kopierat från ${scraperSlug})`)
  return finalDir
}
