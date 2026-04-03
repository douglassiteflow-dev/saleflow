# Samtalshistorik & HistoryTimeline Cleanup

## Sammanfattning

Gör om `/history` från händelselogg till samtalshistorik per agent. Rensa HistoryTimeline (kundkort/dialer) så den bara visar samtal med utfall. Flytta händelseloggen till `/admin/logs`.

## 1. HistoryTimeline-komponenten (kundkort + dialer)

**Nuläge:** Visar en mix av `callLogs` + `auditLogs` (tilldelningar, statusändringar, sessions, OTP, etc.)

**Nytt:** Visa **bara callLogs**. Varje samtal har alltid ett utfall.

**Per samtal i timelinen:**
- Utfalls-badge (möte bokat, callback, ej svar, etc.) — med färgkodad dot
- Agentnamn (vem som ringde)
- Tidpunkt
- Anteckningar (om de finns)

**Ta bort:** `auditLogs` prop, all audit-relaterad logik (ACTION_LABELS, formatChanges för audit, etc.), tilldelningar, statusändringar, systemloggar.

**Filer:**
- Modify: `frontend/src/components/history-timeline.tsx` — ta bort auditLogs, förenkla
- Modify: `frontend/src/pages/dialer.tsx` — sluta skicka auditLogs till HistoryTimeline
- Modify: `frontend/src/pages/lead-detail.tsx` — sluta skicka auditLogs till HistoryTimeline
- Modify: `frontend/src/pages/meeting-detail.tsx` — sluta skicka auditLogs om den gör det

## 2. Ny `/history`-sida — agentens samtalshistorik

**Vad den visar:** Alla utgående samtal agenten gjort. Default: idag. Datumväljare för att bläddra bakåt.

**Per rad i tabellen:**
- Företagsnamn (från lead via lead_id)
- Telefonnummer (callee)
- Tidpunkt (received_at)
- Samtalslängd (duration i sekunder → formaterat)
- Utfalls-badge (från matchande call_log)
- Klickbar → `/leads/:id`

**Admin:** Ser alla agenters samtal (inte bara sina egna), med agentnamn-kolumn.

**Backend — nytt endpoint:** `GET /api/calls/history?date=YYYY-MM-DD`

Response:
```json
{
  "calls": [
    {
      "id": "uuid",
      "caller": "0101892392",
      "callee": "+46812345678",
      "duration": 142,
      "direction": "outgoing",
      "received_at": "2026-04-03T10:23:45Z",
      "user_id": "uuid",
      "user_name": "Albin Bergvall",
      "lead_id": "uuid",
      "lead_name": "Acme AB",
      "outcome": "meeting_booked",
      "notes": "Bokat demo fredag"
    }
  ]
}
```

Query: Joinar `phone_calls` → `users` (för user_name) → `leads` (för företag) → `call_logs` (för outcome/notes, matchat på lead_id + user_id + samma dag).

Filtrering: `WHERE direction = 'outgoing' AND received_at::date = $date`. Agenter ser bara `user_id = current_user`, admin ser alla.

**Filer:**
- Create: `frontend/src/pages/history.tsx` — ny sida (ersätter nuvarande)
- Create: `frontend/src/api/calls.ts` — ny hook `useCallHistory(date)`
- Modify: `backend/lib/saleflow_web/controllers/call_controller.ex` — nytt `history` action
- Modify: `backend/lib/saleflow_web/router.ex` — ny route `GET /api/calls/history`

## 3. Händelselogg → `/admin/logs`

Flytta nuvarande history.tsx-kod (händelselogg med audit logs) till admin-sidan.

**Filer:**
- Create: `frontend/src/pages/admin-logs.tsx` — exakt nuvarande history.tsx-kod
- Modify: `frontend/src/app.tsx` — ny route `/admin/logs`, ta bort gammal HistoryPage lazy import
- Modify: `frontend/src/components/sidebar.tsx` — lägg till "Loggar" under Admin

## 4. Sidebar-ändringar

**Agent-sektion:**
- Dashboard
- Ringare
- Möten
- Historik → `/history` (ny samtalshistorik)
- Profil

**Admin-sektion:**
- Användare
- Importera
- Listor
- Statistik
- Förfrågningar
- **Loggar** → `/admin/logs` (händelselogg, ny)

## 5. Tester

- HistoryTimeline: uppdatera test att inte förvänta sig audit logs
- Ny history-sida: testa rendering med samtal, datumväljare, tom lista
- Admin-logs: testa att den renderar händelseloggen korrekt
- Backend: testa `GET /api/calls/history` — rätt filtrering per user/date
