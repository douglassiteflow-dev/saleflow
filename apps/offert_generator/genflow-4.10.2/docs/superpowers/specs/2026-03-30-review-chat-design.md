# AI-chat för korrigering av genererade hemsidor

## Problem

Säljaren granskar den genererade hemsidan men kan inte göra justeringar utan att regenerera hela sajten. Små ändringar (färg, ta bort en sektion, byta typsnitt) kräver idag en ny fullgenerering.

## Lösning

En chatbubbla i ReviewResult-sidan. Säljaren skriver vad som ska ändras, Claude Code redigerar HTML-filen direkt, iframen refreshas.

## Tillåtna ändringstyper (whitelist)

AI:n får BARA göra dessa typer av ändringar:
1. Ändra färger (bakgrund, text, knappar, sektioner)
2. Ändra/ta bort text (rubriker, beskrivningar, knapptexter)
3. Ta bort hela sektioner (t.ex. recensioner, galleri, tjänster)
4. Byta typsnitt (Google Fonts)
5. Ändra spacing/storlekar (padding, margin, font-size)
6. Byta bildordning

Allt utanför listan nekas med ett vänligt svar: "Jag kan bara göra mindre justeringar som färger, text, typsnitt och ta bort sektioner."

## Backend: `POST /api/edit-site`

**Request:** `{ slug, message }`

**Vad den gör:**
1. Bygger en systemprompt med whitelisten + sökväg till `output/{slug}/site/index.html`
2. Spawnar `claude -p "<prompt>" --dangerously-skip-permissions --max-turns 5 --output-format stream-json`
3. Väntar på att processen avslutas
4. Returnerar `{ ok: true, response: "<Claudes svar>" }` eller `{ ok: false, error: "..." }`

**Systemprompt:**
```
Du är en webbutvecklare som gör små justeringar på en genererad hemsida.

Filen du ska redigera: {filePath}

Du får BARA göra dessa typer av ändringar:
- Ändra färger (bakgrund, text, knappar, sektioner)
- Ändra eller ta bort text (rubriker, beskrivningar)
- Ta bort hela sektioner
- Byta typsnitt (Google Fonts CDN)
- Ändra spacing och storlekar (padding, margin, font-size)
- Byta bildordning

Om användaren ber om något annat, svara: "Jag kan bara göra mindre justeringar som färger, text, typsnitt och ta bort sektioner."

Användarens önskemål: {message}
```

## Frontend: Chat-drawer i ReviewResult

**Chatbubbla:**
- Fast position nere till höger
- Ikon (MessageSquare eller liknande)
- Klick togglar drawern

**Drawer:**
- Glider upp underifrån, ~40% av skärmhöjden
- Meddelandelista (användare + AI)
- Inputfält + skicka-knapp
- Spinner med "AI redigerar..." medan anropet pågår
- Efter OK: iframe refreshas med `iframe.src = iframe.src`

**State:**
- Chatthistorik i React-state (försvinner vid navigering)
- Ingen persistering behövs

**Inga ändringar i services.html:** Om kunden har en separat tjänstesida redigeras bara index.html.

## Kodändringar

| Fil | Ändring |
|-----|---------|
| `server/routes/edit-site.js` | Ny fil — POST endpoint som spawnar Claude Code |
| `server/index.js` | Registrera `/api/edit-site` route |
| `ui/src/lib/api.ts` | Ny `editSite()` funktion |
| `ui/src/pages/ReviewResult.tsx` | Lägg till chatbubbla + drawer |
