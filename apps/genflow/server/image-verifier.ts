import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PIPELINE_DIR } from './lib/platform'
import type { LogFn } from './lib/types'

const UNSPLASH_RE = /https:\/\/images\.unsplash\.com\/[^\s"')]+/g

interface Allowlist {
  [businessType: string]: string[]
}

export async function verifyAllImages(
  outputDir: string,
  businessType: string,
  log: LogFn,
): Promise<void> {
  const siteDir = join(outputDir, 'site')
  if (!existsSync(siteDir)) {
    log('Bildverifiering skippas — ingen site-katalog')
    return
  }

  const allowlistPath = join(PIPELINE_DIR, 'unsplash-allowlist.json')
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf-8')) as Allowlist
  const fallbacks: string[] = allowlist[businessType] ?? allowlist.default ?? []

  if (fallbacks.length === 0) {
    log('Varning: ingen fallback-lista för bildverifiering')
  }

  const htmlFiles = readdirSync(siteDir).filter((f) => f.endsWith('.html'))
  log(`Bildverifiering startar på ${htmlFiles.length} filer`)

  for (const file of htmlFiles) {
    const path = join(siteDir, file)
    let html = readFileSync(path, 'utf-8')
    const urls = [...new Set(html.match(UNSPLASH_RE) ?? [])]
    let fallbackIndex = 0
    let replaced = 0

    for (const url of urls) {
      if (!(await isReachable(url))) {
        if (fallbacks.length > 0) {
          const fallback = fallbacks[fallbackIndex % fallbacks.length]
          fallbackIndex++
          html = html.split(url).join(fallback)
          replaced++
        }
      }
    }

    if (replaced > 0) {
      writeFileSync(path, html)
      log(`${file}: ersatte ${replaced} trasiga bild-URL:er`)
    }
  }

  log('Bildverifiering klar')
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}
