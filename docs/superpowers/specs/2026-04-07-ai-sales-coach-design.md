# AI Sales Coach Platform — Design Spec

## Översikt

Bygger ut Saleflow med en komplett AI Sales Coach som matchar och överträffar Gong. Tre sub-projekt som byggs i ordning:

1. **Enhanced Transcription Pipeline** — batch-transkribering, 25-punkts scorecard, talk ratio, post-call summary
2. **AI Coach Report System** — longitudinell coaching med historik, best/worst examples, uppföljning över tid
3. **Intelligence Features** — sökbart inspelningsbibliotek, keyword tracking, deal health score

---

## Sub-projekt 1: Enhanced Transcription Pipeline

### 1.1 Batch-transkribering (alla samtal >20s)

**Idag:** Bara "Möte bokat"-samtal transkriberas.
**Nytt:** Alla samtal med `duration > 20` transkriberas dagligen.

**Ny worker: `DailyTranscriptionWorker`**
- Oban cron: `"0 16 * * 1-5"` (16:00 vardagar)
- Hittar alla `phone_calls` från idag med:
  - `duration > 20`
  - `transcription IS NULL`
  - `recording_key IS NOT NULL`
- Köar `TranscriptionWorker` för varje (med 2s delay mellan för att inte överbelasta API)

**Ändring i befintlig `TranscriptionWorker`:**
- Behåll existerande trigger vid "Möte bokat" (snabb feedback)
- DailyTranscriptionWorker fångar allt som missats

### 1.2 25-punkts Scorecard

Utöka befintlig 5-kategori scoring till 25 punkter (5 kategorier × 5 frågor).

**Kategorier och frågor:**

**Öppning (5 frågor):**
1. Tydlig agenda/syfte med samtalet (1-10)
2. Tonfall och energi — professionellt och engagerande (1-10)
3. Research-referens — visar kunskap om kundens verksamhet (1-10)
4. Permission-based approach — frågar om kundens tid (1-10)
5. Hook — ger kunden anledning att lyssna vidare (1-10)

**Discovery/Behovsanalys (5 frågor):**
1. Öppna frågor — undviker ja/nej-frågor (1-10)
2. Follow-up frågor — gräver djupare i svaren (1-10)
3. Aktivt lyssnande — sammanfattar kundens svar (1-10)
4. Pain points — identifierar kundens problem (1-10)
5. Business impact — kopplar problem till affärspåverkan (1-10)

**Pitch/Presentation (5 frågor):**
1. Relevans — anpassar pitch till kundens behov (1-10)
2. Värde vs features — fokuserar på nytta, inte tekniska detaljer (1-10)
3. Social proof — nämner liknande kunder/resultat (1-10)
4. Tydlighet — enkelt och begripligt språk (1-10)
5. Anpassning — skräddarsyr baserat på discovery (1-10)

**Invändningshantering (5 frågor):**
1. Acknowledge — bekräftar kundens oro (1-10)
2. Clarify — ställer klargörande fråga (1-10)
3. Reframe — omformulerar till värde-diskussion (1-10)
4. Evidence — ger bevis/exempel (1-10)
5. Confidence — behåller lugn och professionalism (1-10)

**Avslut (5 frågor):**
1. Tydligt nästa steg — föreslår konkret action (1-10)
2. Urgency — skapar tidskänsla utan press (1-10)
3. Commitment — får muntligt åtagande (1-10)
4. Tidslinje — sätter datum/tid (1-10)
5. Follow-up plan — bekräftar vad som händer härnäst (1-10)

**Datamodell-ändring:**

`phone_calls.transcription_analysis` JSON utökas med:
```json
{
  "scorecard": {
    "opening": {
      "agenda": { "score": 7, "comment": "..." },
      "tonfall": { "score": 8, "comment": "..." },
      "research": { "score": 5, "comment": "..." },
      "permission": { "score": 6, "comment": "..." },
      "hook": { "score": 7, "comment": "..." },
      "avg": 6.6
    },
    "discovery": { ... },
    "pitch": { ... },
    "objection_handling": { ... },
    "closing": { ... },
    "overall_avg": 6.8
  },
  "conversation": [...],
  "summary": "...",
  "customer_needs": [...],
  "objections": [...],
  "positive_signals": [...],
  "voicemail": false
}
```

Bakåtkompatibelt — befintlig `score` behålls, `scorecard` läggs till.

### 1.3 Talk Ratio & Speaker Segmentation

**Whisper med timestamps:** Byt till `whisper-1` med `timestamp_granularities: ["segment"]` för att få tidsstämplar per segment.

**Speaker diarization:** Använd Claude för att separera talare (Säljare/Kund) baserat på kontext.

**Nya fält i `transcription_analysis`:**
```json
{
  "talk_ratio": {
    "seller_pct": 62,
    "customer_pct": 38,
    "longest_monolog_seconds": 45,
    "avg_seller_turn_seconds": 12,
    "avg_customer_turn_seconds": 8
  }
}
```

**Best practice:** Optimal talk ratio är 40-60% säljare / 60-40% kund. Monolog >60s är en red flag.

### 1.4 AI Post-Call Summary

**Trigger:** Direkt efter `TranscriptionWorker` slutfört (inte bara i dagsrapporten).

**Ny action på phone_call:** `update_summary`
- Sparar kort sammanfattning (2-3 meningar) i `phone_calls.call_summary` (ny kolumn)
- Visas i kundmodal-historiken och i call-history

**Migration:** Lägg till `call_summary` (text, nullable) på `phone_calls`.

---

## Sub-projekt 2: AI Coach Report System

### 2.1 CoachReportWorker

**Ersätter** befintlig `DailyReportWorker` med en kraftfullare version.

**Oban cron:** `"10 16 * * 1-5"` (16:10 vardagar, efter transkribering)

**Input till Claude:**
1. Alla transkriberade samtal från idag (med 25-punkts scorecard)
2. Alla tidigare agent_daily_reports (senaste 14 dagarna)
3. Företagets aktiva playbook
4. Agentens mål (från goals-tabellen)

**Output: Unified HTML Coaching Report**

Strukturerad rapport med:

**Sektion 1: Dagssammanfattning**
- KPIs: Samtal, möten, konvertering, snittbetyg
- Jämförelse med igår och veckogenomsnitt

**Sektion 2: Scorecard-översikt**
- 5 kategorier med snittbetyg + SVG sparkline (trend 5 dagar)
- Talk ratio snitt + trend

**Sektion 3: Uppföljning från igår**
- AI läser gårdagens rapport
- Specifik feedback: "Igår sa jag X. Idag ser jag Y."
- Progress-tracking på specifika beteenden

**Sektion 4: Dagens bästa samtal (top 3)**
- Betyg, sammanfattning, vad som var bra
- Referenslänk: `/api/calls/{phone_call_id}/recording` + tid i samtalet
- Citat från transkriptionen

**Sektion 5: Dagens svagaste samtal (bottom 3)**
- Betyg, sammanfattning, vad som gick fel
- Referenslänk med specifik tidpunkt
- Konkret förslag på hur det kunde hanterats bättre

**Sektion 6: Fokus imorgon**
- EN specifik sak att förbättra (baserat på svagaste scorecard-kategori)
- Koppling till playbook-steg
- Exempel-fras att använda

**Sektion 7: Veckotrend**
- SVG bar chart med 5 kategorier, 5 dagars data
- Markerar förbättringar och försämringar

### 2.2 Datamodell

**Utöka `agent_daily_reports`:**

| Fält | Typ | Nytt? |
|------|-----|-------|
| score_breakdown | jsonb | ✅ 5 kategori-snitt |
| talk_ratio_avg | float | ✅ |
| call_count | integer | Befintlig |
| meeting_count | integer | ✅ |
| conversion_rate | float | ✅ |
| focus_area | string | ✅ Vad som ska förbättras |
| previous_focus_followed_up | boolean | ✅ |

### 2.3 Frontend: Report-tab

Befintlig report-tab i dialern visar redan HTML via iframe. Ingen frontend-ändring behövs — bara bättre rapport-innehåll.

---

## Sub-projekt 3: Intelligence Features

### 3.1 Sökbart Inspelningsbibliotek

**Ny sida:** `/call-library` (admin + agent)

**Funktioner:**
- Fulltextsök i transkriptioner (PostgreSQL `tsvector` / `to_tsvector('swedish', transcription)`)
- Filter: agent, datum, utfall, betyg-range, duration
- Resultat visar: matchande text-snippet med highlight, samtal-metadata, play-knapp
- Klick → öppnar transkription med markerat sökord + inspelning

**Backend:**
- Ny kolumn: `phone_calls.transcription_search` (tsvector, auto-genererad)
- Ny endpoint: `GET /api/calls/search?q=...&agent=...&from=...&to=...&outcome=...&min_score=...`
- GIN-index på tsvector-kolumnen

### 3.2 Keyword/Topic Tracking

**Auto-detect i transkriptioner:**
- Konkurrent-mentions (konfigurerbara nyckelord per organisation)
- Vanliga invändningar (kategoriserade)
- Köpsignaler ("vi är intresserade", "berätta mer", "vad kostar det")
- Red flags ("ring inte igen", "inte intresserad")

**Ny tabell: `call_topics`**
| Fält | Typ |
|------|-----|
| id | uuid |
| phone_call_id | uuid FK |
| topic_type | atom (:competitor, :objection, :buying_signal, :red_flag) |
| keyword | string |
| context | text (mening runt nyckelordet) |
| timestamp_seconds | integer (var i samtalet) |

**Extraheras av Claude** under transkriptionsanalysen (utöka prompt).

**Dashboard-widget:** "Vanligaste konkurrenter denna vecka", "Trending invändningar"

### 3.3 Deal Health Score

**AI-driven riskbedömning per DemoConfig/Deal.**

**Signaler som analyseras:**
- Tid i current stage (stagnerar?)
- Antal samtal vs meetings
- Senaste samtalets scorecard-betyg
- Kundens sentiment (från transkription)
- Talk ratio trend (kunden pratar mindre = tappar intresse?)

**Ny kolumn:** `demo_configs.health_score` (integer 1-100)
**Beräknas:** Dagligen av en `DealHealthWorker` som kör efter transkribering

**Visas i:** Demo-tab med färgkodad indikator (grön >70, gul 40-70, röd <40)

---

## Avgränsningar

- Ingen realtids-transkribering (batch-process)
- Ingen video-analys (bara audio)
- Ingen email/LinkedIn-integration (Gong Engage)
- Ingen forecast AI predictor (Gong Forecast)
- Inga multi-channel sekvenser

---

## Kvalitetskrav

- 100% test coverage — backend (ExUnit) och frontend (Vitest)
- Inga test-skips
- DRY — ingen duplicerad kod
- Svenska (ÅÄÖ) i all UI-text
- Alla prompts på svenska för bästa resultat
- Max token budget per Claude-anrop: dokumenterat och konfigurerat
