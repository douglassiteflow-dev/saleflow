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

  const prompt = `Du är senior webbutvecklare och kreativ designer som hatar platt/tråkig design. Sidan \`${pageSpec.filename}\` är just genererad men ser PLATT och LIFELESS ut. Din uppgift är att göra den VACKER och RIKT PIMPAD.

Företag: ${businessName}
Affärstyp: ${strategy.businessType}
Sida: ${pageSpec.slug}

## STEG 1: Läs hela filen (Read med limit 1000)

## STEG 2: Identifiera problem

Leta efter:
- Sektioner som bara har text utan visuella accenter → för platta
- Bara en bild på hela sidan → behöver fler
- Inga dekorativa element → behöver former, patterns, accent-linjer
- Monoton layout utan variation → alternera bakgrundsfärger och sektionstyper
- Brutna Unsplash-URL:er
- Två infinity-scroll-sektioner direkt efter varandra
- Tomma sektioner eller placeholder-text

## STEG 3: LÄGG TILL RIKLIGT MED VISUELL PIMP (obligatoriskt — INTE försiktigt!)

Du MÅSTE lägga till ALLT av följande som är relevant:

### Bilder
- Om sidan bara har 1 bild (bara hero) → lägg till 1-3 till i nyckelsektioner
- Om sidan redan har flera bilder → fokusera på polish och detaljer, inte fler bilder
- Låt vissa sektioner andas med gradient eller färgat block istället för en bild
- Format: \`https://images.unsplash.com/photo-XXX?w=1200&q=80\`

### Hero-sektion
- OBLIGATORISK: \`background-attachment: fixed\` för parallax-effekt
- Gradient overlay: \`linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6))\`
- Stor typografi (60px+) med letter-spacing och text-shadow

### SVG wave-dividers MELLAN sektioner (SPARSAMT)
- **MAX 2 dividers per sida** — inte mellan varje sektion, bara vid viktiga övergångar
- RIKTNING ÄR KRITISKT: vågen måste LUTA ÅT RÄTT HÅLL
- För en divider från en ljus sektion (ovan) till mörk sektion (under):
  \`<svg viewBox="0 0 1440 100" preserveAspectRatio="none" style="display:block;width:100%;height:80px"><path fill="[MÖRKA SEKTIONENS FÄRG]" d="M0,50 C360,100 720,0 1440,50 L1440,100 L0,100 Z"/></svg>\`
- För mörk → ljus, inverterad path:
  \`<svg viewBox="0 0 1440 100" preserveAspectRatio="none" style="display:block;width:100%;height:80px"><path fill="[LJUSA SEKTIONENS FÄRG]" d="M0,50 C360,0 720,100 1440,50 L1440,100 L0,100 Z"/></svg>\`
- Ofta räcker det att ALTERNERA bakgrundsfärger mellan sektioner (ingen divider behövs)

### Dekorativa former — Z-INDEX REGLER ÄR KRITISKA
- Absolut-positionerade dekorativa blobbar i bakgrunden (radial-gradients, stora cirklar med opacity)
- Dot-patterns som accent (repeating-radial-gradient)
- Accent-linjer (1-2px gradient bars som separators)
- Blob-shapes med border-radius variation (ex \`border-radius: 60% 40% 50% 50%\`)

**Z-INDEX REGLER (MÅSTE FÖLJAS, annars fungerar hero inte):**
- Hero-sektionen MÅSTE ha \`position: relative\` på wrapper
- Alla dekorativa element i hero (blobbar, overlays, patterns) MÅSTE ha:
  - \`position: absolute\`
  - \`z-index: 0\` eller \`z-index: 1\` (bakom innehåll)
  - \`pointer-events: none\` (så de inte blockerar CTA-klick)
- Hero-innehåll (rubrik, text, CTA) MÅSTE ha:
  - \`position: relative\`
  - \`z-index: 2\` eller högre (framför dekorationer)
- Header/nav måste ha \`z-index: 10\` och \`position: sticky\` (eller fixed) så den aldrig hamnar under dekorativa element
- SVG wave-dividers MÅSTE ha \`position: relative; z-index: 1\` eller vara en del av normal flow (inte absolute)

Exempel-struktur:
\`\`\`html
<section class="hero" style="position:relative;overflow:hidden">
  <div class="hero-bg" style="position:absolute;inset:0;z-index:0;pointer-events:none">
    <!-- gradient overlay, blobbar, patterns -->
  </div>
  <div class="hero-content" style="position:relative;z-index:2">
    <h1>Rubrik</h1>
    <a href="#" class="cta">Boka nu</a>
  </div>
</section>
\`\`\`

### Kort och knappar
- Glassmorphism där det passar: \`backdrop-filter: blur(10px); background: rgba(255,255,255,0.8)\`
- Box-shadows med färgade accenter (t.ex. \`box-shadow: 0 20px 60px rgba(primary-color, 0.15)\`)
- Hover: translateY(-4px) + shadow intensification
- Border-radius variation (blanda 8px, 16px, 24px — inte samma överallt)

### Animationer (CSS only)
- Fade-in on scroll: \`@keyframes fadeInUp\` + staggered animation-delay per element
- Hover-effekter på allt interaktivt
- Smooth transitions (ease-out 0.3s)

### Typografi
- Letter-spacing på rubriker (-0.02em på h1, +0.05em uppercase labels)
- Accent-font för citat eller highlights
- Gradient text-effekt på huvudrubriken: \`background: linear-gradient(135deg, primary, accent); -webkit-background-clip: text; -webkit-text-fill-color: transparent\`

### Sektionsvariation
- Alternera bakgrundsfärger mellan sektioner (vit → ljusgrå → vit → accent → vit)
- Varje sektion ska kännas visuellt distinkt från den föregående

## REGLER — STRIKT

- Du får BARA redigera innehåll mellan <main> och </main>
- FÖRBJUDET att ändra <head>, <header>, <footer>, <style>
- Sidspecifik CSS → <style>-block DIREKT efter <main>-öppningen, INUTI <main>
- Ändra INTE företagsnamn, tjänster, priser, kontaktinfo
- Ändra INTE nav-länkar eller data-page-attribut
- Ändra INTE active-state-klassen
- ALL text på svenska
- VAR DJÄRV med designen — tveka inte, lägg till MER pimp, inte mindre

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
