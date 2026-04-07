# AI Sales Coach Platform — Design Spec (v2)

## Översikt

Bygger ut Saleflow med en komplett AI Sales Coach som matchar och överträffar Gong — till ~$30/mån istället för $13,000+/år.

**Tech stack:**
- **AssemblyAI Universal-2** — transkription, speaker diarization, sentiment, entity detection, topics, key phrases, auto chapters. Allt i ett API-anrop.
- **AssemblyAI LeMUR** (Claude 4 under huven) — 25-punkts scorecard, sammanfattning, action items, keyword-extraction direkt på transkriptionen.
- **Claude Sonnet 4 Batch API** (50% rabatt) — coaching-rapport med longitudinell tracking.
- **PostgreSQL tsvector + GIN** — fulltext-sök i transkriptioner (dag 1).
- **PostgreSQL pgvector** — semantisk sök med embeddings (dag 2).

**Tre sub-projekt:**
1. **Enhanced Transcription Pipeline** — AssemblyAI batch, 25-punkts scorecard, talk ratio, post-call summary
2. **AI Coach Report System** — longitudinell coaching, best/worst examples, uppföljning över tid
3. **Intelligence Features** — sökbart inspelningsbibliotek, keyword tracking, deal health score

---

## Sub-projekt 1: Enhanced Transcription Pipeline

### 1.1 Byt från Whisper+Claude till AssemblyAI

**Idag:** OpenAI Whisper ($0.006/min) + separat Claude-anrop ($3-15/M tokens). Ingen speaker diarization, inget sentiment, ingen entity detection.

**Nytt:** AssemblyAI Universal-2 ($0.0025/min) med alla features aktiverade i ett anrop.

**Ny TranscriptionWorker (ersätter befintlig):**

```elixir
# Steg 1: Skicka inspelning till AssemblyAI
POST https://api.assemblyai.com/v2/transcript
{
  "audio_url": presigned_r2_url,
  "language_code": "sv",
  "speaker_labels": true,          # Speaker diarization
  "sentiment_analysis": true,       # Sentiment per mening
  "entity_detection": true,         # Namn, företag, datum, tel
  "iab_categories": true,           # Topic detection
  "auto_highlights": true,          # Key phrases
  "auto_chapters": true,            # Sammanfattning per avsnitt
  "summarization": true,            # Overall summary
  "summary_type": "bullets_verbose",
  "summary_model": "informative"
}
```

**Returnerar (ett API-svar):**
```json
{
  "text": "Hej, mitt namn är Milad...",
  "utterances": [
    {"speaker": "A", "text": "Hej, mitt namn är Milad...", "start": 0, "end": 3200, "confidence": 0.95},
    {"speaker": "B", "text": "Hej, vad gäller det?", "start": 3300, "end": 5100, "confidence": 0.92}
  ],
  "sentiment_analysis_results": [
    {"text": "Det låter intressant", "sentiment": "POSITIVE", "confidence": 0.89, "speaker": "B"}
  ],
  "entities": [
    {"entity_type": "person_name", "text": "Anna Svensson"},
    {"entity_type": "organization", "text": "Bella Salong AB"}
  ],
  "iab_categories_result": { "results": [...] },
  "auto_highlights_result": { "results": [{"text": "hemsida", "count": 3}] },
  "chapters": [
    {"summary": "Säljaren presenterar sig och frågar om kundens tid", "start": 0, "end": 15000},
    {"summary": "Kunden beskriver nuvarande situation", "start": 15000, "end": 45000}
  ],
  "summary": "Milad ringde Bella Salong AB...",
  "audio_duration": 181
}
```

**Talk ratio beräknas automatiskt** från `utterances` (speaker A vs B tidsstämplar).

### 1.2 25-punkts Scorecard via AssemblyAI LeMUR

**Efter transkription:** Anropa LeMUR med transkriptionen + företagets playbook.

```
POST https://api.assemblyai.com/lemur/v3/generate/task
{
  "transcript_ids": ["transcript_id"],
  "prompt": "Betygsätt detta säljsamtal mot playbooken...",
  "final_model": "anthropic/claude-sonnet-4",
  "max_output_size": 4000
}
```

LeMUR har direkt access till hela transkriptionen (inklusive speaker labels, timestamps) — inget behov av att skicka rå text. Upp till 10 timmar / 150K tokens i ett anrop.

**Scorecard-struktur (5 × 5 = 25 frågor):**

**Öppning:**
1. Agenda/syfte (1-10)
2. Tonfall och energi (1-10)
3. Research-referens om kundens verksamhet (1-10)
4. Permission-based approach (1-10)
5. Hook — anledning att lyssna vidare (1-10)

**Discovery/Behovsanalys:**
1. Öppna frågor (1-10)
2. Follow-up frågor (1-10)
3. Aktivt lyssnande (1-10)
4. Pain points identifierade (1-10)
5. Business impact koppling (1-10)

**Pitch/Presentation:**
1. Relevans till kundens behov (1-10)
2. Värde vs features (1-10)
3. Social proof (1-10)
4. Tydlighet (1-10)
5. Anpassning baserat på discovery (1-10)

**Invändningshantering:**
1. Acknowledge (1-10)
2. Clarify (1-10)
3. Reframe (1-10)
4. Evidence (1-10)
5. Confidence (1-10)

**Avslut:**
1. Tydligt nästa steg (1-10)
2. Urgency (1-10)
3. Commitment (1-10)
4. Tidslinje (1-10)
5. Follow-up plan (1-10)

**LeMUR returnerar också:**
- `call_summary` (2-3 meningar)
- `customer_needs` (lista)
- `objections` (lista)
- `positive_signals` (lista)
- `keywords` (konkurrenter, köpsignaler, red flags med timestamps)
- `action_items` (nästa steg)
- `voicemail` (true/false)

### 1.3 Uppdaterad datamodell

`phone_calls.transcription_analysis` JSON utökas:

```json
{
  "source": "assemblyai",
  "transcript_id": "abc123",
  
  "conversation": [
    {"speaker": "Säljare", "text": "...", "start": 0, "end": 3200, "sentiment": "NEUTRAL"},
    {"speaker": "Kund", "text": "...", "start": 3300, "end": 5100, "sentiment": "POSITIVE"}
  ],
  
  "talk_ratio": {
    "seller_pct": 58,
    "customer_pct": 42,
    "longest_monolog_seconds": 32,
    "avg_seller_turn_seconds": 8,
    "avg_customer_turn_seconds": 6,
    "total_silence_seconds": 12
  },
  
  "sentiment": {
    "overall": "POSITIVE",
    "positive_pct": 45,
    "negative_pct": 12,
    "neutral_pct": 43
  },
  
  "entities": [
    {"type": "person_name", "text": "Anna Svensson"},
    {"type": "organization", "text": "Bella Salong AB"}
  ],
  
  "chapters": [
    {"summary": "Introduktion och syfte", "start": 0, "end": 15000},
    {"summary": "Discovery — kundens situation", "start": 15000, "end": 45000}
  ],
  
  "scorecard": {
    "opening": {
      "agenda": {"score": 7, "comment": "Tydligt syfte, men saknade tidsram"},
      "tonfall": {"score": 8, "comment": "Engagerande och professionellt"},
      "research": {"score": 5, "comment": "Ingen referens till kundens verksamhet"},
      "permission": {"score": 6, "comment": "Frågade om tid men inte explicit"},
      "hook": {"score": 7, "comment": "Bra hook med branschreferens"},
      "avg": 6.6
    },
    "discovery": { "...": "samma struktur", "avg": 5.8 },
    "pitch": { "...": "samma struktur", "avg": 7.2 },
    "objection_handling": { "...": "samma struktur", "avg": 4.4 },
    "closing": { "...": "samma struktur", "avg": 6.0 },
    "overall_avg": 6.0
  },
  
  "score": {
    "opening": {"score": 7, "comment": "..."},
    "needs_discovery": {"score": 6, "comment": "..."},
    "pitch": {"score": 7, "comment": "..."},
    "objection_handling": {"score": 4, "comment": "..."},
    "closing": {"score": 6, "comment": "..."},
    "overall": 6,
    "top_feedback": "..."
  },
  
  "summary": "Milad ringde Bella Salong AB...",
  "customer_needs": ["Behöver ny hemsida", "Vill ha fler kunder"],
  "objections": ["Har redan en leverantör", "Inte tid just nu"],
  "positive_signals": ["Frågade om pris", "Sa 'berätta mer'"],
  "action_items": ["Skicka offert", "Boka uppföljning torsdag"],
  
  "keywords": {
    "competitors": [{"keyword": "Webnode", "context": "Vi använder Webnode idag", "timestamp": 45}],
    "buying_signals": [{"keyword": "berätta mer", "context": "Ja, berätta mer om det", "timestamp": 62}],
    "red_flags": []
  },
  
  "voicemail": false
}
```

**Bakåtkompatibelt:** `score` (gamla 5-kategori) behålls. `scorecard` (nya 25-punkter) läggs till. Frontend kan visa antingen.

### 1.4 Nya kolumner på phone_calls

Migration:
```sql
ALTER TABLE phone_calls ADD COLUMN call_summary text;
ALTER TABLE phone_calls ADD COLUMN assemblyai_transcript_id text;
ALTER TABLE phone_calls ADD COLUMN talk_ratio_seller integer;  -- % 0-100
ALTER TABLE phone_calls ADD COLUMN sentiment text;             -- POSITIVE/NEGATIVE/NEUTRAL
ALTER TABLE phone_calls ADD COLUMN scorecard_avg float;        -- 0-10, för snabb filtrering
```

### 1.5 Batch-transkribering

**Ny worker: `DailyTranscriptionWorker`**
- Oban cron: `"0 16 * * 1-5"` (16:00 vardagar)
- Hittar alla `phone_calls` från idag med:
  - `duration > 20`
  - `transcription IS NULL`
  - `recording_key IS NOT NULL`
- Köar `TranscriptionWorker` med 3s delay mellan varje (AssemblyAI rate limits)
- Max 100 samtal per batch (säkerhet)

**Behåll befintlig trigger** vid "Möte bokat" för snabb feedback (körs direkt, inte batch).

---

## Sub-projekt 2: AI Coach Report System

### 2.1 CoachReportWorker

**Ersätter** befintlig `DailyReportWorker` med en kraftfullare version.

**Oban cron:** `"10 16 * * 1-5"` (16:10 vardagar, efter transkribering)

**Använder Claude Sonnet 4 Batch API (50% rabatt).**
Prompt caching på playbook → stacked rabatt → ~95% billigare för cached tokens.

**Input till Claude:**
1. Alla transkriberade samtal från idag (med 25-punkts scorecard, talk ratio, sentiment)
2. Senaste 14 dagars `agent_daily_reports` (score_breakdown, focus_area)
3. Företagets aktiva playbook
4. Agentens mål (från goals-tabellen)
5. Keywords/topics från dagens samtal (konkurrenter, invändningar, köpsignaler)

**Output: Unified HTML Coaching Report**

**Sektion 1: Dagssammanfattning**
- KPIs: Samtal, möten, konvertering, snittbetyg, talk ratio
- Jämförelse med igår och veckogenomsnitt
- Sentiment-trend (% positiva samtal)

**Sektion 2: 25-punkts Scorecard-översikt**
- 5 kategorier med snittbetyg + SVG sparkline (trend 5 dagar)
- Detaljerad breakdown: vilka av de 25 frågorna var bäst/sämst
- Talk ratio visualisering + trend

**Sektion 3: Uppföljning från igår**
- AI läser gårdagens rapport och `focus_area`
- Specifik feedback: "Igår sa jag att du behöver ställa fler discovery-frågor. Idag ställde du 4.2 frågor per samtal (upp från 2.8). Bra förbättring!"
- Progress-tracking på specifika scorecard-frågor över tid

**Sektion 4: Dagens bästa samtal (top 3)**
- Scorecard-betyg + sammanfattning
- Vad som var bra — specifika citat med timestamps
- Referenslänk: `/api/calls/{phone_call_id}/recording`
- "Lyssna från 1:34 där du hanterade invändningen om pris perfekt"

**Sektion 5: Dagens svagaste samtal (bottom 3)**
- Scorecard-betyg + sammanfattning + vad som gick fel
- Referenslänk med specifik tidpunkt
- Konkret förslag med exempel-fras från playbooken
- "Vid 0:42 pitchade du direkt utan discovery. Testa istället: 'Hur hanterar ni X idag?'"

**Sektion 6: Keyword Intelligence**
- Konkurrenter som nämndes idag (med frekvens)
- Vanligaste invändningar + förslag på hantering
- Köpsignaler som missades vs fångades

**Sektion 7: Fokus imorgon**
- EN specifik sak att förbättra (baserat på svagaste scorecard-kategori)
- Koppling till playbook-steg med exakt fras
- "Imorgon: Fokusera på discovery-frågor. Använd: 'Hur löser ni det idag?' innan du pitchar."

**Sektion 8: Veckotrend**
- SVG bar chart med 5 kategorier × 5 dagars data
- Markerar förbättringar (↑) och försämringar (↓)
- Overall trajectory: "Du förbättras stadigt — din öppning har gått från 5.2 till 7.1 på 2 veckor"

### 2.2 Datamodell

**Utöka `agent_daily_reports`:**

| Fält | Typ | Nytt? |
|------|-----|-------|
| score_breakdown | jsonb | ✅ 5 kategori-snitt + 25 detaljfrågor |
| talk_ratio_avg | float | ✅ |
| sentiment_positive_pct | float | ✅ |
| call_count | integer | Befintlig |
| meeting_count | integer | ✅ |
| conversion_rate | float | ✅ |
| focus_area | string | ✅ Scorecard-fråga att förbättra |
| focus_area_score_today | float | ✅ Betyg på fokusområdet |
| previous_focus_followed_up | boolean | ✅ |
| top_competitors | jsonb | ✅ ["Webnode": 3, "Squarespace": 1] |
| top_objections | jsonb | ✅ ["har leverantör": 5, "inte tid": 3] |

### 2.3 Frontend: Report-tab

Befintlig report-tab visar redan HTML via iframe. Ingen frontend-ändring behövs — rapporten blir automatiskt bättre.

**Utöka call-analysis-modal** med:
- 25-punkts scorecard (5 expanderbara kategorier × 5 frågor)
- Talk ratio donut chart
- Sentiment timeline
- Chapters/avsnitt med tidsstämplar

---

## Sub-projekt 3: Intelligence Features

### 3.1 Sökbart Inspelningsbibliotek

**Steg 1 (dag 1): PostgreSQL tsvector — fulltext-sök**

Migration:
```sql
ALTER TABLE phone_calls ADD COLUMN transcription_search tsvector
  GENERATED ALWAYS AS (to_tsvector('swedish', COALESCE(transcription, ''))) STORED;

CREATE INDEX idx_phone_calls_search ON phone_calls USING GIN (transcription_search);
```

Endpoint: `GET /api/calls/search?q=pris&agent=...&from=...&to=...&outcome=...&min_score=...`

Returnerar: matchande text-snippet med highlight (`ts_headline`), samtal-metadata, play-knapp.

**Steg 2 (senare): pgvector — semantisk sök**

Migration:
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE call_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_call_id uuid REFERENCES phone_calls ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(3072),
  metadata jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX ON call_embeddings USING hnsw (embedding vector_cosine_ops);
```

**EmbeddingWorker:** Triggas efter transkription. Chunkar text (800 tokens, 400 overlap), genererar embeddings via OpenAI `text-embedding-3-large`, sparar i `call_embeddings`.

**Hybrid search:** Kombinerar tsvector (nyckelord) + pgvector (semantisk) + metadata-filter.

**Ny sida:** `/call-library` (admin + agent)
- Sökfält med filter (agent, datum, utfall, betyg, duration)
- Resultat med highlight, metadata, play-knapp
- Klick → transkription med markerat sökord + inspelning

### 3.2 Keyword/Topic Tracking

**Extraheras av AssemblyAI** (entity_detection + iab_categories) + **LeMUR** (custom keyword-extraction).

**Ny tabell: `call_topics`**
| Fält | Typ |
|------|-----|
| id | uuid |
| phone_call_id | uuid FK |
| topic_type | atom (:competitor, :objection, :buying_signal, :red_flag, :entity) |
| keyword | string |
| context | text (mening runt nyckelordet) |
| timestamp_seconds | integer |
| sentiment | string (POSITIVE/NEGATIVE/NEUTRAL) |

**Populeras automatiskt** från AssemblyAI + LeMUR output vid transkription.

**Frontend: Dashboard-widgets**
- "Vanligaste konkurrenter denna vecka" (bar chart)
- "Trending invändningar" (tag cloud med frekvens)
- "Köpsignaler fångade vs missade" (pie chart)

### 3.3 Deal Health Score

**AI-driven riskbedömning per DemoConfig/Deal.**

**Signaler:**
- Tid i current stage (stagnerar?)
- Antal samtal + samtalens scorecard-snitt
- Senaste samtalets sentiment (AssemblyAI)
- Talk ratio trend (kunden pratar mindre = tappar intresse?)
- Keywords (red flags vs buying signals)
- Tid sedan senaste kontakt

**Ny kolumn:** `demo_configs.health_score` (integer 1-100)
**Worker:** `DealHealthWorker` — Oban cron kl 16:15 (efter transkribering + rapport)

**Visas i:** Demo-tab med färgkodad indikator:
- 🟢 >70 — Healthy
- 🟡 40-70 — Attention needed
- 🔴 <40 — At risk

---

## Kostnad

| Tjänst | Per samtal (3 min) | 50 samtal/dag | Månad |
|--------|-------------------|---------------|-------|
| AssemblyAI Universal-2 (transkription + alla features) | $0.0075 | $0.375 | $11 |
| AssemblyAI LeMUR (scorecard + summary) | $0.01 | $0.50 | $15 |
| Claude Batch API (coaching-rapport) | $0.05/agent | - | $3/agent |
| OpenAI Embeddings (pgvector, steg 2) | $0.001 | $0.05 | $1.50 |
| **Total (2 agenter)** | | | **~$34/mån** |

**Gong: $13,000+/år. Saleflow: ~$400/år. 97% billigare.**

---

## Avgränsningar

- Ingen realtids-transkribering (AssemblyAI stödjer det, men vi kör batch)
- Ingen video-analys
- Ingen email/LinkedIn-integration (Gong Engage)
- Ingen forecast AI predictor (Gong Forecast)
- Inga multi-channel sekvenser
- pgvector (semantisk sök) är steg 2 — fulltext-sök först

---

## Migration från befintlig stack

| Befintlig | Ny | Migration |
|-----------|-----|-----------|
| OpenAI Whisper | AssemblyAI Universal-2 | Byt HTTP-endpoint i TranscriptionWorker |
| Separat Claude-anrop för analys | AssemblyAI LeMUR | Integrera i samma worker-flow |
| 5-kategori score | 25-punkts scorecard | Bakåtkompatibelt (behåll `score`, lägg till `scorecard`) |
| DailyReportWorker (basic HTML) | CoachReportWorker (full coaching) | Ersätt worker, behåll tabell |
| Ingen speaker diarization | Inbyggt i AssemblyAI | Gratis med transkription |
| Ingen sentiment | Inbyggt i AssemblyAI | Gratis med transkription |
| Ingen sök | tsvector + pgvector | Ny migration + endpoints |

---

## Kvalitetskrav

- 100% test coverage — backend (ExUnit) och frontend (Vitest)
- Inga test-skips
- DRY — ingen duplicerad kod
- Svenska (ÅÄÖ) i all UI-text
- Alla LeMUR-prompts på svenska
- Mox-baserade tester (mock AssemblyAI + Claude API)
- Rate limiting: max 2 concurrent transcription-workers
- Streaming file download från R2 (inte ladda hela filen i minnet)
- Max token budget per Claude-anrop: dokumenterat och konfigurerat
