import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runClaude } from '../claude-runner'
import { parseClaudeOutput } from '../lib/parse-claude-output'
import type { LogFn } from '../lib/types'

export async function runFinalReview(outputDir: string, log: LogFn): Promise<void> {
  const siteDir = join(outputDir, 'site')
  const indexPath = join(siteDir, 'index.html')

  if (!existsSync(indexPath)) {
    log('Ingen hemsida att slutgranska')
    return
  }

  log('Slutgranskning startad — bilder, ÅÄÖ, teknisk check...')

  const bilderDir = join(siteDir, 'bilder')
  let availableImages: string[] = []
  if (existsSync(bilderDir)) {
    availableImages = readdirSync(bilderDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
  }

  const prompt = `Du är en QA-ingenjör som gör en SISTA teknisk granskning innan hemsidan går live. Allt måste vara perfekt.

Filen att granska och REDIGERA: index.html

Tillgängliga lokala bilder i ./bilder/: ${availableImages.join(', ')}

## STEG 1: Läs hela index.html noggrant

## STEG 2: Kolla VARJE punkt nedan och fixa allt du hittar

### Bilder — KRITISKT
- Hitta ALLA img-taggar och background-image i filen
- För varje bild, kolla om src/url pekar på en fil som finns i listan ovan (./bilder/filnamn)
- Om en bild refererar till en fil som INTE finns i listan → ersätt med en passande Unsplash-URL:
  - Salong/frisör: https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80
  - Spa: https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=80
  - Massage: https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=800&q=80
  - Nagel: https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80
  - Träning/gym: https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80
  - Generellt: https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80
- Kolla att INGA bilder har tomma src="" eller src="#" eller src="placeholder"
- Kolla att alla bilder har alt-attribut

### Svenska tecken — ÅÄÖ
- Filen MÅSTE ha <meta charset="UTF-8">
- Sök efter felkodade tecken: Ã¥ (ska vara å), Ã¤ (ska vara ä), Ã¶ (ska vara ö), Ã… (ska vara Å), Ã„ (ska vara Ä), Ã– (ska vara Ö)
- Kolla att alla svenska ord stavas korrekt med rätt ÅÄÖ
- Vanliga fel: "Oppettider" → "Öppettider", "Tjanster" → "Tjänster"

### Emojis
- Sök efter ALLA emojis och unicode-symboler och TA BORT dem
- Inga ✦ ✧ ★ ● ◆ ✓ ✗ → ☎ 📍 🏠 eller liknande
- Stjärnbetyg i recensioner ska använda CSS/SVG, INTE unicode-stjärnor

### Trasiga element
- Tomma sektioner utan innehåll → ta bort hela sektionen
- Placeholder-text ("Lorem ipsum", "Coming soon", "Your text here") → ta bort eller ersätt
- Brutna ankarlänkar (#section-som-inte-finns) → fixa eller ta bort
- Dubbla sektioner (t.ex. två "Om oss" eller två footer) → ta bort duplikaten

### Kontrast & läsbarhet
- Hero: text MÅSTE synas tydligt — om den inte gör det, lägg till starkare gradient overlay eller text-shadow
- Alla knappar måste ha tydlig kontrast mot sin bakgrund
- Brödtext får aldrig vara ljusgrå på vit bakgrund — minst #555 på #fff

### Recensioner
- Kolla att recensionskort syns och fungerar
- CSS-animation (@keyframes scrollReviews) måste finnas om auto-scroll används
- Korten måste ha synlig bakgrund, padding, och inte vara klippta av overflow

### Responsivitet
- Kolla att det finns @media queries för mobil
- Text får inte vara mindre än 14px på mobil
- Bilder måste ha max-width: 100% eller object-fit

## STEG 3: VERIFIERA — läs om filen
Läs hela filen EN SISTA GÅNG efter alla ändringar. Om du hittar NYA problem som dina edits orsakat, fixa dem.

## REGLER
- Ändra INTE företagsnamn, tjänster, priser, kontaktinfo
- Du MÅSTE göra faktiska Edit-ändringar för varje problem du hittar
- Sammanfatta kort vad du fixade på SVENSKA`

  try {
    const stdout = await runClaude({
      args: ['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'json'],
      cwd: siteDir,
      log,
    })
    const { editCount, summary } = parseClaudeOutput(stdout)
    if (editCount > 0) {
      log(`Slutgranskning klar — ${editCount} fixar`)
      if (summary) log(`Fixat: ${summary.slice(0, 200)}`)
    } else {
      log('Slutgranskning klar — allt OK')
    }
  } catch (err) {
    log(`Slutgranskning misslyckades (fortsätter): ${(err as Error).message}`)
  }
}
