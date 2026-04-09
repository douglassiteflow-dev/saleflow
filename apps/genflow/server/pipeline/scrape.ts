import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveScraperCommand, OUTPUT_DIR } from '../lib/platform'
import type { LogFn } from '../lib/types'

export async function runScrape(sourceUrl: string, slug: string, log: LogFn): Promise<string> {
  log(`Scrape startat: ${sourceUrl}`)

  const outputDir = join(OUTPUT_DIR, slug)
  mkdirSync(outputDir, { recursive: true })

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

  const dataPath = join(outputDir, 'företagsdata.json')
  if (!existsSync(dataPath)) {
    throw new Error(`Scrape producerade ingen företagsdata.json`)
  }

  log(`Scrape klar: ${outputDir}`)
  return outputDir
}
