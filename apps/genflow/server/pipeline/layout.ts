import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { PIPELINE_DIR, SKILLS_DIR } from '../lib/platform'
import type { Strategy, LogFn } from '../lib/types'

export async function runLayout(strategy: Strategy, outputDir: string, log: LogFn): Promise<void> {
  log('Layout-pass startat...')

  const dataPath = join(outputDir, 'företagsdata.json')
  if (!existsSync(dataPath)) {
    throw new Error(`Företagsdata saknas: ${dataPath}`)
  }
  const businessData = readFileSync(dataPath, 'utf-8').slice(0, 2000)

  const pagesList = strategy.pages
    .map((p) => `- ${p.slug} (${p.filename})`)
    .join('\n')

  const templatePath = join(PIPELINE_DIR, 'layout-prompt.md')
  const template = readFileSync(templatePath, 'utf-8')
  const prompt = template
    .replace('$BUSINESS_DATA', businessData)
    .replace('$BUSINESS_TYPE', strategy.businessType)
    .replace('$PAGES_LIST', pagesList)
    .replaceAll('$OUTPUT_DIR', outputDir)

  let attempt = 0
  const maxAttempts = 2

  while (attempt < maxAttempts) {
    attempt++
    log(`Layout försök ${attempt}/${maxAttempts}`)

    await runClaude({
      args: [
        '--dangerously-skip-permissions',
        '--bare',
        '--add-dir', SKILLS_DIR,
        '-p', prompt,
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
                log(`Använder ${block.name}...`)
              } else if (block.type === 'text' && block.text && block.text.length > 10) {
                log(block.text.slice(0, 150))
              }
            }
          }
        } catch {
          // Icke-JSON, ignorera
        }
      },
    })

    try {
      verifyLayout(join(outputDir, 'layout.html'), strategy)
      log('Layout verifierad')
      return
    } catch (err) {
      log(`Layout-verifiering misslyckades: ${(err as Error).message}`)
      if (attempt >= maxAttempts) {
        throw new Error(`Layout-passet kunde inte producera giltig layout.html efter ${maxAttempts} försök`)
      }
    }
  }
}

export function verifyLayout(layoutPath: string, strategy: Strategy): void {
  if (!existsSync(layoutPath)) {
    throw new Error('layout.html saknas')
  }
  const html = readFileSync(layoutPath, 'utf-8')

  const contentMatches = html.match(/<!-- CONTENT -->/g) ?? []
  if (contentMatches.length !== 1) {
    throw new Error(`Förväntade exakt en <!-- CONTENT -->, hittade ${contentMatches.length}`)
  }

  if (!html.includes('{{PAGE_TITLE}}')) {
    throw new Error('Saknar {{PAGE_TITLE}}')
  }
  if (!html.includes('{{PAGE_DESCRIPTION}}')) {
    throw new Error('Saknar {{PAGE_DESCRIPTION}}')
  }
  if (!/<style[^>]*>[\s\S]*?<\/style>/.test(html)) {
    throw new Error('Saknar <style>-block')
  }

  for (const page of strategy.pages) {
    const re = new RegExp(`data-page=["']${page.slug}["']`)
    if (!re.test(html)) {
      throw new Error(`Saknar nav-länk för "${page.slug}"`)
    }
  }
}
