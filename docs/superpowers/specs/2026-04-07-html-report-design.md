# HTML Rapport — Design Spec

## Overview

Claude genererar en komplett HTML-rapport per agent per dag. Rapporten renderas i dialerns rapport-tab via iframe och är mail-redo.

## Arkitektur

1. `DailyReportWorker` (kl 16:10 mån-fre) samlar agentens data
2. Skickar till Claude med HTML-mall + designregler + all data
3. Claude returnerar komplett HTML (inline CSS, inline SVG-charts)
4. HTML sparas i `agent_daily_reports.report`
5. Frontend renderar i `<iframe srcDoc={html} sandbox>`

## Innehåll

**Coaching först (60%), stats som stöd (40%):**

### Obligatoriska sektioner
1. **Header** — agentens namn, datum, snittbetyg
2. **Coaching** — highlights, observationer, citat från samtal med källreferens
3. **Checklista** — konkreta uppgifter för imorgon med playbook-referens
4. **Statistik** — inline SVG-charts (donut, radar, progress bars)
5. **Avslut** — progress-not + motivation

### Längd
2-3 skärmar, 1-2 min att läsa.

## Designregler (Claude får dessa)

- Bakgrund: `#FAFAFA`, kort: vita `border-radius: 16px`, skugga `0 1px 3px rgba(0,0,0,0.06)`
- Typsnitt: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Accent: `#0071E3`, success: `#10B981`, warning: `#F59E0B`, danger: `#EF4444`
- Max-width: `600px` centrerad (mail-kompatibelt)
- Allt inline CSS — inga klasser, inga `<style>`-block
- SVG-charts direkt i HTML (donut för utfall, radar för kompetenser, bars för betyg)
- Inga JavaScript, inga externa resurser, inga bilder

## Claude-prompt

Claude får:
- HTML-mall med designregler
- Agentens samtalsdata (betyg per kategori, utfall, sammanfattningar, citat)
- Aktiv playbook
- Senaste 5 rapporterna (för progress-tracking)

Claude returnerar: ren HTML som börjar med `<!DOCTYPE html>`. Inget JSON, ingen markdown.

Claude FÅR:
- Resonera utanför playbooken (med källangivelse)
- Anpassa layout efter dagens data
- Generera inline SVG-charts med verklig data

Claude FÅR INTE:
- JavaScript
- Externa resurser
- `<style>`-block (bara inline styles)

## Frontend

**Rapport-tabben i dialern:**
- Datumnavigering (som idag)
- Om HTML-rapport finns → `<iframe srcDoc={html} sandbox>` med auto-höjd
- Om JSON-rapport finns (legacy) → nuvarande React-rendering
- Om ingen rapport → "Dagens rapport uppdateras kl 16:10 varje vardag"

## Backend

- `agent_daily_reports.report` sparar HTML (tidigare JSON)
- `DailyReportWorker` uppdateras med ny prompt
- API returnerar `{ html: "..." }` om HTML, `{ report: {...} }` om JSON (backward compat)

## Kvalitetskrav

- 100% test coverage
- DRY
- Inline CSS only
- Max-width 600px (mail-redo)
