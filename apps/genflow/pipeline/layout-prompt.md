# Layout-mall för flersidig webbplats

Du är webbdesigner. Producera EN enda fil — `layout.html` — som fungerar som delad mall för alla sidor.

## Företagsdata

$BUSINESS_DATA

## Affärstyp

$BUSINESS_TYPE

## Sidor som kommer skapas

$PAGES_LIST

Navbaren MÅSTE innehålla länkar till exakt dessa sidor.

## Krav på layout.html

1. Komplett `<!DOCTYPE html>` (lang="sv")
2. `<head>` med:
   - `<title>{{PAGE_TITLE}}</title>` (platshållare — oförändrad)
   - `<meta name="description" content="{{PAGE_DESCRIPTION}}">` (platshållare — oförändrad)
   - Google Fonts `<link>` (välj 1-2 fonter baserat på affärstypen)
   - En enda `<style>`-block med ALL CSS för webbplatsen:
     * CSS custom properties (`--primary`, `--secondary`, `--accent`, `--text`, `--bg`, `--surface`)
     * Reset, base, typografi
     * Komponenter: header, nav, footer, knappar, kort, hero, bento-grid, recensions-scroll, kontaktformulär
     * Responsiv navbar med hamburger på mobil
3. `<header>` med logo + `<nav>` där varje `<a>` har `data-page="<slug>"`-attribut
4. `<main><!-- CONTENT --></main>` — EXAKT denna kommentar
5. `<footer>` med kontaktinfo, öppettider, länkar till alla sidor

## Färgpalett per affärstyp

- frisör/skönhet: varma pasteller, koppar, champagne
- spa: lugna jordnära toner, sage, terracotta
- nagel: mjukt rosa, nude, accentfärg
- massage: neutrala jordnära, mörkt trä
- klinik: rent vitt, ljusblått, mint
- annat: välj baserat på företagsnamn och beskrivning

## Typografi

Två Google Fonts: en för rubriker, en för brödtext.

## FÖRBJUDET

- `<main>` får INTE innehålla något annat än `<!-- CONTENT -->`
- Inga placeholder-texter som "Lorem ipsum"
- Inga externa CSS-filer utöver Google Fonts

## Leverans

Spara till $OUTPUT_DIR/layout.html. Inga andra filer.
