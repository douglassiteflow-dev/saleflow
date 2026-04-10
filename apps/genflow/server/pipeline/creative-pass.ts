import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { parseClaudeOutput } from '../lib/parse-claude-output'
import type { LogFn } from '../lib/types'

export async function runCreativePass(outputDir: string, log: LogFn): Promise<void> {
  const siteDir = join(outputDir, 'site')
  const indexPath = join(siteDir, 'index.html')

  if (!existsSync(indexPath)) {
    log('Ingen hemsida att förbättra kreativt')
    return
  }

  log('Kreativ designpass startad...')

  let businessName = ''
  let businessType = ''
  const dataPath = join(outputDir, 'företagsdata.json')
  if (existsSync(dataPath)) {
    try {
      const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
      businessName = data.namn ?? ''
      businessType = data.om_oss ?? data.meta_beskrivning ?? ''
    } catch { /* ignore */ }
  }

  const prompt = `Du är en kreativ frontend-designer med 15 års erfarenhet. Du älskar unika, handgjorda webbupplevelser som INTE ser AI-genererade ut.

Filen att förbättra: index.html

Företag: ${businessName}
Om företaget: ${businessType}

## Din uppgift

Läs hemsidan och tänk högt om vad som gör den generisk vs unik. Sen gör du den SPECIELL.

## STEG 1: Resonera (tänk högt)
- Vad är första intrycket? Ser den AI-genererad ut?
- Vad saknas för att ge den personlighet?
- Vilken känsla borde besökaren få? (lyxig salong? avslappnande spa? energisk frisör?)
- Vilka designelement skulle göra den unik?

## STEG 2: Implementera kreativa förbättringar

Välj 2-4 av dessa och implementera dem:

### Section dividers / former
- Lägg till SVG wave-dividers, diagonal cuts, eller curved separators mellan sektioner
- Exempel: \`<div style="position:relative"><svg viewBox="0 0 1440 80" style="position:absolute;bottom:-1px;width:100%"><path fill="[nästa sektions färg]" d="M0,64L48,58.7C96,53,192,43,288,48C384,53,480,75,576,74.7C672,75,768,53,864,42.7C960,32,1056,32,1152,37.3C1248,43,1344,53,1392,58.7L1440,64L1440,80L0,80Z"></path></svg></div>\`
- Variera formerna — använd inte samma överallt

### Hero parallax (OBLIGATORISKT)
- Hero-bilden MÅSTE ha en parallax scroll-effekt
- Använd \`background-attachment: fixed; background-size: cover; background-position: center;\` på hero-sektionen
- Om hero använder en img-tag, byt till bakgrundsbild med parallax

### Subtila animationer (CSS only)
- Fade-in on scroll med \`@keyframes fadeInUp\` + \`animation-delay\` per element
- Hover-effekter på kort och knappar (scale, shadow, color shift)
- Smooth transitions på alla interactive elements

### Visuella detaljer
- Gradient overlays på hero-bilden för bättre textläsbarhet
- Glassmorphism-effekter på kort (backdrop-filter: blur)
- Subtila box-shadows med färgade accenter
- Border-radius variation (inte allt 8px — blanda med 16px, 24px, pill-shapes)
- Accent-linjer eller dots som dekorativa element

### Typografi-touch
- En accent-font för citat eller highlights
- Letter-spacing på rubriker
- Gradient text-effekt på huvudrubriken om det passar stilen

## STEG 3: VERIFIERA ditt arbete
Läs om HELA filen efter dina ändringar. Kolla:
- Fungerar alla sektioner visuellt? Är något trasigt?
- Har parallax-effekten lagts till korrekt?
- Ser hover-effekter rimliga ut?
- Om något gick sönder — fixa det nu.

## REGLER
- Ändra INTE innehåll (text, tjänster, priser, kontaktinfo)
- Ändra INTE bilder
- Allt måste vara inline CSS/JS (ingen extern fil)
- Subtilt och professionellt — inte överdrivet
- Sammanfatta vad du la till på SVENSKA`

  try {
    const stdout = await runClaude({
      args: ['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'json'],
      cwd: siteDir,
      log,
    })
    const { editCount, summary } = parseClaudeOutput(stdout)
    if (editCount > 0) {
      log(`Kreativ designpass klar — ${editCount} förbättringar`)
      if (summary) log(`Detaljer: ${summary.slice(0, 200)}`)
    } else {
      log('Kreativ designpass klar — inga förbättringar gjorda')
    }
  } catch (err) {
    log(`Kreativ designpass misslyckades (fortsätter): ${(err as Error).message}`)
  }
}
