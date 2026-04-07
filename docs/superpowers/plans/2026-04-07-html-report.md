# HTML Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude generates complete HTML reports (inline CSS + SVG charts) instead of JSON, rendered in iframe in agent dialer.

**Architecture:** DailyReportWorker prompt changed to output HTML. Backend detects HTML vs JSON and returns accordingly. Frontend renders HTML in sandboxed iframe with auto-height.

**Tech Stack:** Elixir/Phoenix (backend), React/TypeScript (frontend), Claude Sonnet 4 API

---

## File Structure

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/lib/saleflow/workers/daily_report_worker.ex` | New prompt that outputs HTML instead of JSON |
| `backend/lib/saleflow_web/controllers/call_controller.ex` | `agent_report` returns `html` field for HTML reports |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/src/components/dialer/report-tab.tsx` | Replace React rendering with iframe for HTML reports |
| `frontend/src/api/daily-summary.ts` | Update `AgentReportData` type to include `html` field |

---

## Task 1: Update DailyReportWorker prompt to output HTML

**Files:**
- Modify: `backend/lib/saleflow/workers/daily_report_worker.ex`

- [ ] **Step 1: Replace the Claude prompt**

In `daily_report_worker.ex`, find the prompt string (around line 148) and replace the entire prompt with an HTML-generating prompt. The prompt should:

1. Give Claude the design system (colors, fonts, border-radius, max-width 600px)
2. Tell it to generate inline SVG charts using the data
3. Provide all agent data (calls, scores, playbook, previous reports)
4. Tell it to return ONLY `<!DOCTYPE html>...` — no markdown, no JSON

Replace the prompt (from `prompt = """` to the closing `"""`) with:

```elixir
    prompt = """
    Du är #{first_name}s personliga säljcoach. Generera en komplett HTML-rapport.

    #{if playbook, do: "SÄLJMANUS:\n#{playbook}\n", else: ""}

    SAMTALSDATA IDAG (#{Date.to_iso8601(date)}):
    #{calls_text}

    #{previous_text}

    GENERERA EN KOMPLETT HTML-RAPPORT. Följ dessa regler EXAKT:

    DESIGN:
    - Börja med <!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>
    - Body: background #FAFAFA, font-family -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif, margin 0, padding 24px
    - Kort: background white, border-radius 16px, box-shadow 0 1px 3px rgba(0,0,0,0.06), padding 20px 24px, margin-bottom 16px
    - Max-width: 600px, margin 0 auto
    - Accent: #0071E3, Success: #10B981, Warning: #F59E0B, Danger: #EF4444
    - Text: #1D1D1F (primary), #86868B (secondary)
    - ALL CSS INLINE på varje element. Inga <style> block. Inga klasser.
    - Inga JavaScript. Inga externa resurser.

    INNEHÅLL (i denna ordning):
    1. HEADER — Namn, datum, stort snittbetyg (cirkel med siffra)
    2. COACHING — Varje highlight i eget kort med ikon (✅ bra, ⚡ förbättra, 👁 observation). Citera specifika saker från samtalen. Ange källa: "(Playbook: X)" eller "(Egen observation)".
    3. BÄSTA CITAT — Ett citat från dagens bästa samtal i ett kort med vänsterrand
    4. CHECKLISTA — Blått kort med checkboxar (☐ unicode) för imorgons uppgifter med källa
    5. SVG CHARTS — Två charts bredvid varandra i ett kort:
       a) Donut chart (inline SVG) för utfall (möte/callback/ej intresserad etc) med färger
       b) Horisontella bars för betyg per kategori (Öppning, Behov, Pitch, Invändning, Avslut) med siffror
    6. PROGRESS — Kort om agentens utveckling, referera till tidigare coaching om den finns
    7. AVSLUT — Kort motiverande mening i italic

    SVG CHARTS:
    - Donut: <svg viewBox="0 0 100 100" width="120" height="120"> med <circle> och stroke-dasharray
    - Bars: <div> med inline background-color och width i procent
    - Använd VERKLIG DATA från samtalen ovan

    REGLER FÖR TEXTEN:
    - Kort och rakt på sak. Max 2 meningar per punkt.
    - Citera specifika saker agenten sa i samtalen.
    - Om du coachade igår — kolla om #{first_name} lyssnade.
    - Resonera fritt utanför manuset om du ser mönster.

    Returnera BARA HTML. Ingen markdown. Inget ```html. Börja direkt med <!DOCTYPE html>.
    """
```

- [ ] **Step 2: Update the response parsing**

Find the response parsing section (around line 195-210). Currently it expects JSON inside `content[].text`. Change it to extract raw HTML text:

Replace:
```elixir
      {:ok, %{status: 200, body: %{"content" => content}}} ->
        text = content
          |> Enum.filter(fn block -> block["type"] == "text" end)
          |> Enum.map(fn block -> block["text"] end)
          |> Enum.join("")

        cleaned = String.replace(text, ~r/```json\n?|\n?```/, "")
        case Jason.decode(cleaned) do
          {:ok, report} -> {:ok, report}
          _ -> {:ok, %{"raw" => text}}
        end
```

With:
```elixir
      {:ok, %{status: 200, body: %{"content" => content}}} ->
        html = content
          |> Enum.filter(fn block -> block["type"] == "text" end)
          |> Enum.map(fn block -> block["text"] end)
          |> Enum.join("")
          |> String.trim()

        # Strip markdown code fences if Claude wrapped it
        html = html
          |> String.replace(~r/^```html\n?/, "")
          |> String.replace(~r/\n?```$/, "")
          |> String.trim()

        if String.starts_with?(html, "<!DOCTYPE") || String.starts_with?(html, "<html") do
          {:ok, html}
        else
          {:error, "Claude did not return HTML"}
        end
```

- [ ] **Step 3: Update save_agent_report to save HTML string**

Find `save_agent_report` function. Currently it receives a map/JSON. Now it receives an HTML string. The save function likely already calls `Jason.encode!` — change it to save raw HTML:

```elixir
  defp save_agent_report(user_id, date, html, score_avg, call_count) do
    Saleflow.Repo.query(
      "INSERT INTO agent_daily_reports (id, user_id, date, report, score_avg, call_count, inserted_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW()) ON CONFLICT (user_id, date) DO UPDATE SET report = $3, score_avg = $4, call_count = $5",
      [Ecto.UUID.dump!(user_id), date, html, score_avg, call_count]
    )
  end
```

Note: `html` is already a string, so it saves directly — no JSON encoding needed.

- [ ] **Step 4: Run backend tests**

Run: `cd backend && mix test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow/workers/daily_report_worker.ex
git commit -m "feat: DailyReportWorker generates HTML reports instead of JSON"
```

---

## Task 2: Update agent_report API endpoint

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/call_controller.ex`

- [ ] **Step 1: Update agent_report to detect HTML vs JSON**

Find `agent_report` function (line 269). Replace it:

```elixir
  def agent_report(conn, params) do
    user = conn.assigns.current_user
    date = parse_date(params["date"]) || Date.utc_today()

    case Saleflow.Repo.query(
           "SELECT report, score_avg, call_count FROM agent_daily_reports WHERE user_id = $1 AND date = $2",
           [Ecto.UUID.dump!(user.id), date]
         ) do
      {:ok, %{rows: [[report, score, calls]]}} when is_binary(report) ->
        if String.starts_with?(String.trim(report), "<!DOCTYPE") || String.starts_with?(String.trim(report), "<html") do
          # HTML report (new format)
          json(conn, %{date: Date.to_iso8601(date), html: report, score_avg: score, call_count: calls})
        else
          # JSON report (legacy format)
          parsed = case Jason.decode(report) do
            {:ok, data} -> data
            _ -> nil
          end
          json(conn, %{date: Date.to_iso8601(date), report: parsed, score_avg: score, call_count: calls})
        end

      _ ->
        json(conn, %{date: Date.to_iso8601(date), html: nil, report: nil, score_avg: nil, call_count: nil})
    end
  end
```

- [ ] **Step 2: Run tests**

Run: `cd backend && mix test`

- [ ] **Step 3: Commit**

```bash
git add backend/lib/saleflow_web/controllers/call_controller.ex
git commit -m "feat: agent_report endpoint returns html field for HTML reports"
```

---

## Task 3: Update frontend to render HTML in iframe

**Files:**
- Modify: `frontend/src/api/daily-summary.ts`
- Modify: `frontend/src/components/dialer/report-tab.tsx`

- [ ] **Step 1: Update AgentReportData type**

In `frontend/src/api/daily-summary.ts`, update the interface:

```typescript
export interface AgentReportData {
  date: string;
  html: string | null;
  report: AgentReport | null;
  score_avg: number | null;
  call_count: number | null;
}
```

- [ ] **Step 2: Rewrite report-tab.tsx**

Replace the entire content of `frontend/src/components/dialer/report-tab.tsx` with a simplified version that:
- Shows date navigation at top
- If `html` exists → renders in iframe with auto-height
- If `report` exists (legacy JSON) → renders with current React components
- If neither → shows "Dagens rapport uppdateras kl 16:10 varje vardag"

```typescript
import { useState, useRef, useEffect } from "react";
import { useAgentReport } from "@/api/daily-summary";
import { todayISO } from "@/lib/date";
import { ChevronLeft, ChevronRight } from "lucide-react";

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}

export function ReportTab() {
  const [date, setDate] = useState(todayISO());
  const { data: rd, isLoading } = useAgentReport(date);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const prev = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); };
  const next = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); if (d.toISOString().slice(0, 10) <= todayISO()) setDate(d.toISOString().slice(0, 10)); };
  const isToday = date === todayISO();

  // Auto-adjust iframe height
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !rd?.html) return;

    const adjustHeight = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          iframe.style.height = doc.body.scrollHeight + 32 + "px";
        }
      } catch { /* cross-origin safety */ }
    };

    iframe.addEventListener("load", adjustHeight);
    return () => iframe.removeEventListener("load", adjustHeight);
  }, [rd?.html]);

  return (
    <div className="flex-1 overflow-auto bg-[#FAFAFA]">
      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={prev} className="p-1.5 rounded-full hover:bg-black/5 cursor-pointer transition">
          <ChevronLeft className="h-4 w-4 text-[#86868B]" />
        </button>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-[#1D1D1F] capitalize">{fmtDate(date)}</p>
          {isToday && <p className="text-[11px] text-[#0071E3]">Idag</p>}
        </div>
        <button onClick={next} disabled={isToday} className="p-1.5 rounded-full hover:bg-black/5 cursor-pointer transition disabled:opacity-20">
          <ChevronRight className="h-4 w-4 text-[#86868B]" />
        </button>
      </div>

      {isLoading ? (
        <div className="px-6 py-16 text-center">
          <p className="text-[13px] text-[#86868B]">Laddar rapport...</p>
        </div>
      ) : rd?.html ? (
        <iframe
          ref={iframeRef}
          srcDoc={rd.html}
          sandbox="allow-same-origin"
          className="w-full border-0"
          style={{ minHeight: "400px" }}
          title="Daglig rapport"
        />
      ) : (
        <div className="px-6 py-16 text-center">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-auto" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <p className="text-[15px] text-[#1D1D1F]">Dagens rapport uppdateras kl 16:10 varje vardag</p>
            <p className="text-[12px] text-[#86868B] mt-1">Bläddra bakåt för att se tidigare rapporter</p>
          </div>
          <button onClick={prev} className="mt-4 text-[13px] text-[#0071E3] hover:underline cursor-pointer">← Föregående dag</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: 0 TypeScript errors.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/daily-summary.ts frontend/src/components/dialer/report-tab.tsx
git commit -m "feat: render HTML reports in iframe, fallback for legacy JSON"
```

---

## Task 4: Test end-to-end

- [ ] **Step 1: Regenerate reports in prod**

After deploying, delete today's reports and trigger regeneration:
```
fly ssh console -a saleflow-app -C 'bin/saleflow rpc "
Saleflow.Repo.query!(\"DELETE FROM agent_daily_reports WHERE date = $1\", [Date.utc_today()])
%{} |> Saleflow.Workers.DailyReportWorker.new() |> Oban.insert()
"'
```

- [ ] **Step 2: Verify HTML was saved**

```
fly ssh console -a saleflow-app -C 'bin/saleflow rpc "
{:ok, %{rows: rows}} = Saleflow.Repo.query(\"SELECT user_id, LEFT(report, 30) FROM agent_daily_reports WHERE date = $1\", [Date.utc_today()])
Enum.each(rows, fn [uid, preview] -> IO.puts(\"#{Ecto.UUID.load!(uid)}: #{preview}\") end)
"'
```

Expected: Reports start with `<!DOCTYPE html>`.

- [ ] **Step 3: Verify in app**

Open dialer → Rapport tab. Should show the HTML report rendered in iframe.
