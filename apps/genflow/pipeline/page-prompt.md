# Sid-innehåll: $PAGE_SLUG

Du bygger INNEHÅLLET för sidan `$PAGE_FILENAME`. Den delade mallen finns i `$LAYOUT_PATH`. Din uppgift är BARA att producera content-fragmentet som ska sättas in i `<main>`. Du får INTE redigera layout-filen och INTE skriva den slutliga sidfilen — Node sköter substitutionen.

## Företagsdata

$BUSINESS_DATA

## Strategi

$STRATEGY

## Sidspecifika data

$PAGE_CONTEXT

## Process

1. Läs `$LAYOUT_PATH` med Read-verktyget (utan limit — läs HELA filen) för att förstå CSS-klasser, tema, komponenter
2. Generera HTML för sektionerna: $PAGE_SECTIONS
3. Skriv ENDAST content-fragmentet till: `$CONTENT_PATH`
   - Bara sektioner som ska visas inuti `<main>`
   - Inget `<html>`, `<head>`, `<body>`, `<header>`, `<footer>`, `<main>`-omslag

## Regler

- Bilder är Unsplash-URL:er: `https://images.unsplash.com/photo-XXXX?w=1200&q=80`
- Ingen `<style>`-tagg normalt — CSS finns i layouten. Sidspecifik CSS får finnas som litet `<style>`-block överst i fragmentet.
- Inget `<script>`
- CSS-klasser ska matcha layoutens `<style>`
- Svenska text genomgående
- Aldrig skriva till `site/`
- Aldrig läsa/ändra andra filer än `$LAYOUT_PATH` (read) och `$CONTENT_PATH` (write)

## Sidtyp-specifika regler

$PAGE_TYPE_RULES
