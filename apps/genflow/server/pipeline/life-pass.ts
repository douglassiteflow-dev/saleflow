import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { parseClaudeOutput } from '../lib/parse-claude-output'
import type { LogFn } from '../lib/types'

export async function runLifePass(outputDir: string, log: LogFn): Promise<void> {
  const siteDir = join(outputDir, 'site')
  const indexPath = join(siteDir, 'index.html')

  if (!existsSync(indexPath)) {
    log('Ingen hemsida att ge liv')
    return
  }

  log('Life Pass startad — ger hemsidan djup, rörelse och personlighet...')

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

  const prompt = `Du är en world-class motion designer och frontend-konstnär. Du tar en färdig hemsida och förvandlar den från "snygg" till "wow, den här LEVER". Du har obegränsat med tid — ta dig tid att verkligen göra varje detalj rätt.

Filen att förbättra: index.html

Företag: ${businessName}
Om företaget: ${businessType}

## Din filosofi

En hemsida som bara är snygg är inte tillräckligt. Den ska KÄNNAS levande. När besökaren scrollar ska saker hända — subtilt, elegant, men märkbart. Varje sektion ska ha sin egen personlighet. Detaljerna är det som skiljer en $300-sajt från en $10,000-sajt.

## STEG 1: Analysera hemsidan djupt

Läs HELA filen. Förstå:
- Vilka sektioner finns?
- Vilka bilder används?
- Vad är färgschemat?
- Vad är stämningen/känslan?
- Var känns det PLATT och LIVLÖST?

## STEG 2: Implementera ALLA dessa förbättringar

Du ska implementera SÅ MÅNGA som möjligt av dessa. Ta dig tid. Gör det rätt.

### A. Scroll-animationer (OBLIGATORISKT)
Implementera IntersectionObserver-baserade animationer:
- Varje sektion fade-in + slide-up när den scrollas in i vy
- Kort och element animeras in med staggered delay (första kortet 0ms, andra 100ms, tredje 200ms, etc.)
- Rubriker kan ha en subtle slide-in från vänster
- Bilder kan scale från 0.95 till 1.0 när de kommer in i vy
- Använd CSS transitions (transform + opacity) — INTE CSS @keyframes för scroll-triggers
- JavaScript IntersectionObserver i en <script> tag i slutet av body

\`\`\`javascript
// Exempel-mönster:
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
\`\`\`

### B. Bildbehandling — shapes och djup
- Ge bilder UNIKA former — inte bara rektanglar:
  - clip-path: polygon() för diagonala snitt
  - clip-path: circle() för runda bilder i about-sektionen
  - clip-path: ellipse() för mjuka ovaler
  - border-radius med OLIKA värden per hörn (t.ex. border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%) för organiska former
- Lägg till subtila box-shadows med FÄRG (inte bara grått):
  - box-shadow: 0 20px 60px rgba(primärfärg, 0.15)
- Bilder som har en liten rotation (transform: rotate(-2deg)) ser mer levande ut
- Overlay-effekter: gradient overlay på bilder som smälter in i bakgrunden

### C. Dekorativa element
- Lägg till SVG-former som flyter i bakgrunden:
  - Cirklar, blobbar, eller abstrakta former i accentfärgen med låg opacity (0.05-0.1)
  - Positionera dem med position: absolute i sektioner
- Subtila linjer eller dots som separatorer
- Dekorativa quotes med stor " i accentfärg bakom recensioner
- Accent-linjer under rubriker (en kort, tjock linje i accentfärgen)

### D. Hover-effekter (OBLIGATORISKT)
- Kort: lift + shadow on hover (transform: translateY(-8px); box-shadow: 0 20px 40px rgba(0,0,0,0.1))
- Knappar: bakgrundsfärg shift + subtle scale (transform: scale(1.02))
- Bilder: subtle zoom (transform: scale(1.05)) med overflow: hidden på container
- Länkar: underline-animation (custom border-bottom som animeras in)
- ALLA transitions ska vara smooth: transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)

### E. Typografi med liv
- Rubriker: letter-spacing som varierar (tighter för stora, wider för små)
- En accent-font för citat eller speciella highlights
- Gradient text på huvudrubriken om det passar (background: linear-gradient; -webkit-background-clip: text)
- Textskuggor på hero-text för djup

### F. Section transitions
- Varje sektion ska ha en mjuk övergång till nästa:
  - SVG wave dividers mellan sektioner med olika former
  - Diagonal cuts (clip-path eller transform: skewY)
  - Gradient fade från en bakgrundsfärg till nästa
- VARIERA formerna — inte samma wave överallt

### G. Hero-sektionen — EXTRA kärlek
- Parallax-effekt på bakgrundsbilden (background-attachment: fixed)
- Gradient overlay för textläsbarhet
- Hero-texten ska ha en "entrance animation" (fade in + slide up vid sidladdning, med CSS animation)
- Om det finns en CTA-knapp: ge den en subtle pulse eller glow-effekt

### H. Micro-interactions
- Scroll-progress indicator (tunn linje överst i sidan som visar scroll-progress)
- Smooth scroll för alla ankarlänkar
- Navbar som ändrar stil vid scroll (transparent → solid bakgrund)
- "Back to top" knapp som fade-in efter scroll

## REGLER
- Ändra INTE innehåll (text, tjänster, priser, kontaktinfo, bilder)
- Allt måste vara inline CSS + JS (inga externa filer utom Google Fonts)
- Subtilt och professionellt — ALDRIG överdrivet eller flashigt
- Alla animationer ska vara SMOOTH — inga jank eller stutter
- Performance: använd transform och opacity för animationer (GPU-accelererat)
- Testa mentalt att det fungerar på mobil — touch-devices har ingen hover, så hover-effekter ska vara bonusar, inte kritiska
- Beskriv ALLT du la till på SVENSKA

## SISTA STEG: VERIFIERA
Läs om HELA filen efter alla ändringar. Kolla att:
- Inget gick sönder (layout, bilder, text)
- Animationer har rätt CSS-syntax
- JavaScript-koden är korrekt (inga syntax-fel)
- Allt ser bra ut på desktop OCH mobil
Om du hittar problem — fixa dem.`

  try {
    const stdout = await runClaude({
      args: ['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'json'],
      cwd: siteDir,
      log,
    })
    const { editCount, summary } = parseClaudeOutput(stdout)
    if (editCount > 0) {
      log(`Life Pass klar — ${editCount} förbättringar`)
      if (summary) log(`Detaljer: ${summary.slice(0, 200)}`)
    } else {
      log('Life Pass klar — inga förbättringar gjorda')
    }
  } catch (err) {
    log(`Life Pass misslyckades (fortsätter): ${(err as Error).message}`)
  }
}
