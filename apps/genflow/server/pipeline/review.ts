import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { parseClaudeOutput } from '../lib/parse-claude-output'
import type { LogFn } from '../lib/types'

export async function runReview(outputDir: string, log: LogFn): Promise<void> {
  const siteDir = join(outputDir, 'site')
  const indexPath = join(siteDir, 'index.html')

  if (!existsSync(indexPath)) {
    log('Ingen hemsida att granska')
    return
  }

  log('Kvalitetsgranskning startad...')

  let businessName = ''
  let businessType = ''
  const dataPath = join(outputDir, 'företagsdata.json')
  if (existsSync(dataPath)) {
    try {
      const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
      businessName = data.namn ?? ''
      businessType = data.meta_beskrivning ?? ''
    } catch { /* ignore */ }
  }

  const bilderDir = join(siteDir, 'bilder')
  let availableImages: string[] = []
  if (existsSync(bilderDir)) {
    availableImages = readdirSync(bilderDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
  }

  const prompt = `Du är en krävande senior webbutvecklare och designer. Du granskar en AI-genererad hemsida och din uppgift är att göra den FLÄCKFRI innan kunden ser den.

Filen att granska och REDIGERA: index.html

Företag: ${businessName}
Typ: ${businessType}
Tillgängliga bilder i ./bilder/: ${availableImages.join(', ')}

## STEG 1: Läs hela filen noggrant

## STEG 2: Identifiera ALLA problem — lista dem

## STEG 3: Fixa VARJE problem du hittade genom att redigera filen

## Vad du ska kolla och fixa:

### Layout & spacing
- Ojämna grids (t.ex. 3 kort i en 2-kolumns-layout) → fixa till jämnt eller använd annan layout
- Inkonsekvent padding/margin mellan sektioner → gör enhetligt
- Element som överlappar eller ser klämda ut → fixa spacing
- Sektioner med för lite eller för mycket whitespace

### Typografi
- Inkonsekvent font-storlek på samma nivå → standardisera
- För liten text (<14px body) → öka
- Dålig kontrast mellan text och bakgrund → ändra färg
- Saknade Google Fonts-imports → lägg till

### Färger & kontrast (KRITISKT)
- Hero-sektionen: text MÅSTE vara tydligt läsbar mot bakgrundsbilden — använd gradient overlay eller text-shadow
- Om färgpaletten ser tråkig ut (allt grått, inga accentfärger) → lägg till en varm accent
- Dålig kontrast (ljus text på ljus bakgrund, mörk text på mörk bakgrund) → fixa OMEDELBART
- Inkonsekvent knappfärg → standardisera
- Knappar måste ha tillräcklig kontrast för att synas tydligt

### Bilder
- img-taggar som pekar på filer som INTE finns i listan ovan → ersätt med Unsplash
- För Unsplash, använd RIKTIGA bild-URL:er som: https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80 (salong)
- Välj bilder som passar: salong, spa, massage, skönhet, hår, naglar, etc.
- Om hemsidan har färre än 3 bilder, lägg till stämningsbilder från Unsplash
- Hero-sektionen MÅSTE ha en bra bild

### Recensioner
- Om det finns en recensionssektion, kontrollera att den FUNGERAR visuellt:
  - Korten syns ordentligt (inte dolda, klippta eller osynliga)
  - CSS-animationen för auto-scroll är korrekt (@keyframes med translateX)
  - Korten har bakgrund, padding och skugga så de sticker ut
- Om recensionssektionen ser trasig ut → skriv om CSS:en helt

### Struktur
- Tomma sektioner eller placeholder-text ("Lorem ipsum", "Coming soon") → ta bort
- Brutna länkar → fixa eller ta bort

## STEG 4: VERIFIERA ditt arbete
Efter alla ändringar, läs HELA filen en sista gång och kontrollera:
- Är varje sektion synlig och korrekt?
- Fungerar alla bilder?
- Är texten läsbar överallt?
- Om du hittar fler problem — fixa dem nu.

## REGLER
- Ändra INTE företagsnamn, tjänster, priser, telefonnummer eller kontaktinfo
- Du MÅSTE läsa filen och göra faktiska Edit-ändringar — inte bara säga vad som behövs
- Efter att du verifierat, sammanfatta kort vad du fixade på SVENSKA`

  try {
    const stdout = await runClaude({
      args: ['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'json'],
      cwd: siteDir,
      log,
    })
    const { editCount, summary } = parseClaudeOutput(stdout)
    if (editCount > 0) {
      log(`Kvalitetsgranskning klar — ${editCount} ändringar gjorda`)
      if (summary) log(`Ändringar: ${summary.slice(0, 200)}`)
    } else {
      log('Kvalitetsgranskning klar — inga ändringar behövdes')
    }
  } catch (err) {
    log(`Kvalitetsgranskning misslyckades (fortsätter): ${(err as Error).message}`)
  }
}
