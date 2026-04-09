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

  const prompt = `Du är senior webbutvecklare och kreativ designer som följer konverteringsforskning för lokala tjänsteföretag. Sidan \`${pageSpec.filename}\` är just genererad. Din uppgift: polera den enligt high-converting landing page-regler. Lägg till snygga detaljer utan att överdriva.

Företag: ${businessName}
Affärstyp: ${strategy.businessType}
Sida: ${pageSpec.slug}

## KONVERTERINGSREGLER (MÅSTE FÖLJAS)

### Visual balance — STRIKTA TAK
- MAX 2 dekorativa dividers per sida (helst bara mellan hero→services och före final CTA)
- MAX 2 dekorativa accenter per sida (t.ex. en gradient bakom heron + en cirkel bakom testimonial). Aldrig mer.
- MAX 3 bakgrundsfärgsväxlingar totalt (ett bas, ett alternativ, inte striped)
- MAX 1 scroll-animation-effekt på hela sidan (inte parallax överallt)
- Alla dekorativa element MÅSTE vara bakom content med opacity 0.1-0.25

### Hero-sektion — RENHET
- INGA blobbar, patterns, floating shapes, eller noise overlays INUTI hero
- Hero har EN visuell fokuspunkt: bakgrundsbild med gradient overlay
- Rubrik MAX 10 ord, stor och tung
- En primär CTA — "Boka tid" eller "Se lediga tider", aldrig "Kontakta oss" eller "Läs mer"
- Betyg/stjärnor MÅSTE vara inom 200px från CTA om det finns recensioner

### Mobile sticky CTA bar (OBLIGATORISKT på index.html)
- Lägg till en position:fixed bottom sticky CTA bar som visas BARA på mobile (<768px)
- Bar-höjd 56px minimum, full-width eller nära-full-width knapp
- Bar visas efter user scrollat förbi heron (CSS \`display:none\` på desktop)
- Body får padding-bottom motsvarande bar-höjden på mobile
- Samma CTA-text som hero

### F-pattern / Z-pattern
- Services och testimonials: headlines left-aligned, Content to the right
- Hero: Z-pattern med CTA bottom-right

## STEG 1: Läs hela filen med Read-verktyget (utan limit — läs ALLT i en ta)

## STEG 2: Identifiera problem

- Fler än 2 dividers? → ta bort de sämsta
- Fler än 2 dekorativa accenter (blobbar, patterns)? → ta bort de sämsta
- Fler än 3 bakgrundsfärgsväxlingar? → sänk till max 3
- Dekorativa element INNE I hero? → ta bort (hero ska vara rent)
- Wall of text (paragraf >80 ord)? → dela upp
- Primary CTA "Kontakta oss" eller "Läs mer"? → byt till "Boka tid"
- Rubrik >10 ord? → förkorta
- Mobile sticky CTA saknas på index? → lägg till
- Betyg inte nära CTA? → flytta (max 200px från CTA)

## STEG 3: Lägg till subtila designdetaljer (inom taken ovan)

### Z-INDEX REGLER (kritisk — hero måste fungera)
- Hero-sektion: \`position: relative; overflow: hidden\`
- Dekorativa element i hero (om några): \`position: absolute; z-index: 0-1; pointer-events: none\`
- Hero-innehåll (rubrik, CTA): \`position: relative; z-index: 2\`
- Header/nav: \`z-index: 10\`

Exempel:
\`\`\`html
<section class="hero" style="position:relative;overflow:hidden">
  <div class="hero-bg" style="position:absolute;inset:0;z-index:0;pointer-events:none"></div>
  <div class="hero-content" style="position:relative;z-index:2"><h1>...</h1></div>
</section>
\`\`\`

### Mobile sticky CTA (OBLIGATORISKT på index.html — inte andra sidor)
Lägg till längst ner i <main>:
\`\`\`html
<div class="mobile-sticky-cta" style="position:fixed;bottom:0;left:0;right:0;background:var(--color-bg-primary);padding:8px 16px;box-shadow:0 -4px 12px rgba(0,0,0,0.08);z-index:100;display:none">
  <a href="#boka" class="primary-cta" style="display:block;width:100%;text-align:center;padding:14px;min-height:56px">Boka tid</a>
</div>
<style>
  @media (max-width:768px) {
    .mobile-sticky-cta { display:block !important }
    main { padding-bottom:72px }
  }
</style>
\`\`\`

### Designdetaljer (valfritt, inom tak ovan)
- Gradient text på huvudrubriken (en gång): \`background:linear-gradient(135deg,primary,accent);-webkit-background-clip:text;color:transparent\`
- Subtila hover-effekter: \`transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.08)\`
- Fade-in-on-scroll på testimonials eller services (EN animation)
- Letter-spacing på rubriker (-0.02em h1)
- Thin hairline divider istället för shape-divider: \`<hr style="border:none;border-top:1px solid rgba(0,0,0,0.08);margin:60px auto;max-width:200px">\`

### F-pattern / Z-pattern
- Services och testimonials: left-aligned rubriker
- Hero: Z-pattern (rubrik top-left → CTA center/bottom-right)

## REGLER — STRIKT

- Du får BARA redigera innehåll mellan <main> och </main>
- FÖRBJUDET att ändra <head>, <header>, <footer>, <style>
- Sidspecifik CSS → <style>-block DIREKT efter <main>-öppningen, INUTI <main>
- Ändra INTE företagsnamn, tjänster, priser, kontaktinfo
- Ändra INTE nav-länkar eller data-page-attribut
- Ändra INTE active-state-klassen
- ALL text på svenska
- BALANS — inte "mer är bättre", utan "rätt tak, inom dessa"

## Beskriv kort på svenska vad du fixade`

  await runClaude({
    args: [
      '--dangerously-skip-permissions',
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
