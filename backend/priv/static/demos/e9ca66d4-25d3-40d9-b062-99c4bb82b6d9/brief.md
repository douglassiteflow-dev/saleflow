# Demo-hemsida Brief

## Uppdrag

Du ska skapa en professionell demo-hemsida för ett svenskt företag. All information ska hämtas från företagets befintliga hemsida.

## Steg 1: Läs företagets hemsida

Besök denna URL och extrahera all relevant information:

**URL:** https://example.se

Extrahera:
- Företagsnamn
- Bransch/verksamhet
- Alla tjänster med priser (om tillgängliga)
- Kontaktinformation (telefon, e-post, adress)
- Öppettider (om tillgängliga)
- Recensioner/betyg (om tillgängliga)
- Beskrivning av verksamheten

## Steg 2: Bestäm design

Baserat på branschen, välj:
- **Färgpalett** — 5 färger (primary, secondary, accent, background, text) som passar branschen
- **Typsnitt** — Google Fonts som passar stilen
- **Stockbilder** — Välj passande Unsplash-bilder. Format: `https://images.unsplash.com/photo-XXXXX?w=1200&q=80`

## Steg 3: Generera hemsidan

Skapa filen `priv/static/demos/e9ca66d4-25d3-40d9-b062-99c4bb82b6d9/site/index.html` — en komplett, single-file HTML-sida med ALL CSS och JS inline.

### Krav

**Logo:**
- Generera en text-logo i HTML/CSS med företagsnamnet
- Använd passande typsnitt och färg från paletten
- ALDRIG använda kundens logotyp-bild

**Bilder:**
- Använd ENBART Unsplash-stockbilder
- ALDRIG använda bilder från kundens hemsida
- Välj bilder som passar branschen och verksamheten
- Hero-bild ska vara stämningsfull och relaterad till branschen

**Tjänster:**
- Inkludera ALLA tjänster från kundens sida
- Om fler än 15 tjänster: använd "Visa fler"-toggle
- Visa priser om tillgängliga

**Recensioner/betyg:**
- Om recensioner finns: visa som horisontellt scrollande kort (CSS animation, infinite loop)
- Om aggregerat betyg finns: visa badge i hero-sektionen

**Layout:**
- Responsive design (mobil + desktop)
- Sektioner: Hero → Om oss → Tjänster → Recensioner (om finns) → Kontakt → Footer
- Modern, professionell design
- INGEN "Team"-sektion

**Tekniskt:**
- Single HTML file — all CSS och JS inline
- Inga externa beroenden förutom Google Fonts och Unsplash-bilder
- Smooth scroll-navigation
- Semantisk HTML5
