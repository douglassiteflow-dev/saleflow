import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = join(__filename, '..')

// Roten för genflow-appen — en nivå över dist-electron/ eller server/
export const APP_ROOT = process.env.APP_ROOT ?? join(__dirname, '..', '..')

// Claude CLI binary path
export function resolveClaudeBin(): string {
  // Försök i PATH först
  const envPath = process.env.PATH ?? ''
  for (const dir of envPath.split(':')) {
    const candidate = join(dir, 'claude')
    if (existsSync(candidate)) return candidate
  }
  // Fallback till /usr/local/bin (standard för Homebrew + manuell install)
  const fallback = '/usr/local/bin/claude'
  if (existsSync(fallback)) return fallback
  // Sista fallback
  return 'claude'
}

export const CLAUDE_BIN = resolveClaudeBin()

// Python binary path
export function resolvePythonBin(): string {
  const envPath = process.env.PATH ?? ''
  for (const name of ['python3', 'python']) {
    for (const dir of envPath.split(':')) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return 'python3'
}

export const PYTHON_BIN = resolvePythonBin()

// Scraper path — i dev är det scraper/scrape.py, i packaged app är det bin/scrape (PyInstaller binär)
export function resolveScraperCommand(): { cmd: string; args: (url: string) => string[] } {
  // I packaged app: bin/scrape
  const packagedScraper = join((process as { resourcesPath?: string }).resourcesPath ?? '', 'bin', 'scrape')
  if (existsSync(packagedScraper)) {
    return {
      cmd: packagedScraper,
      args: (url: string) => [url, '--no-images'],
    }
  }
  // I dev: python3 scraper/scrape.py
  const devScraper = join(APP_ROOT, 'scraper', 'scrape.py')
  return {
    cmd: PYTHON_BIN,
    args: (url: string) => [devScraper, url, '--no-images'],
  }
}

// Skills-katalogen
export const SKILLS_DIR = join(APP_ROOT, 'skills')

// Pipeline-katalogen (prompt templates)
export const PIPELINE_DIR = join(APP_ROOT, 'pipeline')

// Output-katalogen (per-jobb artefakter)
export const OUTPUT_DIR = join(APP_ROOT, 'output')
