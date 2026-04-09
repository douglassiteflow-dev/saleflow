import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import type { PageSpec, Strategy, LogFn } from '../lib/types'

export async function runPolish(
  pageSpec: PageSpec,
  strategy: Strategy,
  outputDir: string,
  log: LogFn,
): Promise<void> {
  const siteDir = join(outputDir, 'site')
  const filePath = join(siteDir, pageSpec.filename)

  if (!existsSync(filePath)) {
    log(`Polish skippas — ${pageSpec.filename} finns inte`)
    return
  }

  log(`Polish startat: ${pageSpec.slug}`)

  const dataPath = join(outputDir, 'företagsdata.json')
  let businessName = ''
  try {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
    businessName = data.namn ?? data.name ?? ''
  } catch {
    // ignore
  }

  const prompt = `Du är senior webbutvecklare och kreativ designer. Du granskar OCH förbättrar sidan \`${pageSpec.filename}\`. Layout-mallen har redan genererats och är ansvarig för tema, header, footer och <style>-blocket. Din uppgift är att polera <main>-innehållet.

Företag: ${businessName}
Affärstyp: ${strategy.businessType}
Sida: ${pageSpec.slug}

## STEG 1: Läs filen på EN GÅNG (Read med limit 1000)

## STEG 2: Granska <main>-innehållet

Leta efter:
- Ojämna grids, dålig spacing, överlappande element
- Inkonsekvent typografi
- Dålig kontrast
- Tomma sektioner, placeholder-text
- Brutna Unsplash-URL:er
- Två infinity-scroll-sektioner direkt efter varandra

## STEG 3: Förbättra — lägg till 2-4 av följande

- Hero parallax (OBLIGATORISKT på index.html om sidan har hero)
- Fade-in-on-scroll-animationer
- Hover-effekter på kort och knappar
- Gradient overlays på hero-bilder
- Glassmorphism på kort (backdrop-filter: blur)
- SVG wave-dividers
- Subtila accent-linjer

## REGLER — STRIKT

- Du får BARA redigera innehåll mellan <main> och </main>
- FÖRBJUDET att ändra <head>, <header>, <footer>, <style>
- Sidspecifik CSS → <style>-block DIREKT efter <main>-öppningen, INUTI <main>
- Ändra INTE företagsnamn, tjänster, priser, kontaktinfo
- Ändra INTE nav-länkar eller data-page-attribut
- Ändra INTE active-state-klassen
- ALL text på svenska

## Beskriv kort på svenska vad du fixade`

  await runClaude({
    args: [
      '--dangerously-skip-permissions',
      '--bare',
      '-p', prompt,
      '--output-format', 'stream-json',
    ],
    cwd: siteDir,
    log,
    onLine: (line) => {
      try {
        const msg = JSON.parse(line) as { type?: string; message?: { content?: Array<{ type: string; name?: string }> } }
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_use' && block.name) {
              log(`[${pageSpec.slug} polish] ${block.name}...`)
            }
          }
        }
      } catch {
        // ignore
      }
    },
  })

  verifyPolishedPage(filePath, outputDir, log)
  log(`Polish klar: ${pageSpec.slug}`)
}

function verifyPolishedPage(filePath: string, outputDir: string, log: LogFn): void {
  if (!existsSync(filePath)) {
    log(`Varning: ${filePath} finns inte efter polish`)
    return
  }

  const html = readFileSync(filePath, 'utf-8')

  if (html.includes('<!-- CONTENT -->')) {
    log(`Varning: <!-- CONTENT --> finns kvar i ${filePath} efter polish`)
  }

  // Diff av <head> mot layout.html
  const layoutPath = join(outputDir, 'layout.html')
  if (!existsSync(layoutPath)) return

  const layoutHtml = readFileSync(layoutPath, 'utf-8')
  const headRe = /<head>[\s\S]*?<\/head>/
  const pageHead = html.match(headRe)?.[0]
  const layoutHead = layoutHtml.match(headRe)?.[0]

  if (pageHead && layoutHead) {
    const normalize = (s: string) =>
      s
        .replace(/<title>[^<]*<\/title>/, '<title></title>')
        .replace(/content="[^"]*"/g, 'content=""')
    if (normalize(pageHead) !== normalize(layoutHead)) {
      log(`Varning: <head> modifierad av polish i ${filePath}`)
    }
  }
}
