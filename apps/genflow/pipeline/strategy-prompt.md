# Innehållsstrategi för flersidig webbplats

Du är innehållsstrategist för en webbyrå. Analysera företagsdatan nedan och bestäm:
1. Vilka sidor som behövs (från en fast kandidatlista)
2. Vilka tjänster som ska vara featured på index
3. Hur recensioner ska visas
4. Om galleri behövs och vilka Unsplash-teman som passar

## Företagsdata

$BUSINESS_DATA

## Tillgängliga sidtyper (fast lista)

- `index` — alltid obligatorisk
- `tjanster` — lämplig när >15 tjänster eller >4 kategorier
- `om-oss` — lämplig när om_oss-text >200 tecken eller ≥3 personal finns
- `galleri` — lämplig när affärstypen gynnas av visuellt innehåll (salong, spa, nagel, massage, skönhet, klinik)
- `kontakt` — lämplig när minst 2 av följande finns: adress, telefon, öppettider, karta

## Minimum-regel

Om INGA kandidater triggas — skippa alla undersidor. Allt packas in på `index.html` (tjänster som "visa fler"-toggle, om-oss som sektion, kontakt i footer).

## Recensions-regler

- ≤3 recensioner → statiska kort på index
- >3 recensioner → horisontell infinity-scroll på index (ALDRIG på en separat recensioner-sida)

## Galleri-regler

- Galleri visas ALLTID som bento-grid (varierade cell-storlekar) — ALDRIG infinity-scroll eller carousel
- När du väljer galleri: ge 3-5 konkreta Unsplash-söktermar baserat på affärstypen

## Ingen team-sida

Personal nämns som text i `om-oss` eller i footern — ingen dedikerad team-sektion med porträtt.

## Output

Respondera med ENDAST valid JSON, inget annat:

```json
{
  "reasoning": "2-4 meningar motivering",
  "businessType": "frisör | spa | nagel | massage | skönhet | klinik | annat",
  "pages": [
    {
      "slug": "index",
      "filename": "index.html",
      "sections": ["hero", "intro", "featured-tjanster", "recensioner", "kontakt-cta"],
      "reason": "Huvudsida"
    }
  ],
  "services": {
    "total": 0,
    "featuredForIndex": [{"namn": "...", "kategori": "...", "reason": "..."}],
    "categoryOrder": ["..."]
  },
  "reviews": {
    "total": 0,
    "displayMode": "statiska-kort",
    "placement": "index"
  },
  "gallery": {
    "needed": true,
    "layout": "bento",
    "placement": "galleri",
    "themes": ["modern salong interiör", "hår styling närbild"]
  }
}
```
