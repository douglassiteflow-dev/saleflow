# Notissystem — Design Spec

## Sammanfattning

In-app notissystem i dialern med dropdown från klockan. Notiser sparas i DB (läst/oläst), pushas i realtid via WebSocket, och triggas av systemhändelser. Agenten kan agera direkt från notisen.

## Notis-typer

### 1. Möte snart
- **Trigger:** 15 min före mötestid (MeetingReminderWorker, redan finns)
- **Text:** "Möte om 15 min — {företag}"
- **Action:** Klick → öppnar mötes-detalj i dialern
- **Email:** Ja (redan implementerat)

### 2. Uppdatera mötesstatus
- **Trigger 1:** 1 timme efter mötets schemalagda tid, om status fortfarande = scheduled
- **Trigger 2:** Dagen efter mötesdagen, om status fortfarande = scheduled (eskalering)
- **Text:** "Uppdatera möte — {företag}"
- **Inline actions:** Genomförd, No-show, Boka om
- **Email:** Nej (bara in-app)

### 3. Callback förfallen
- **Trigger:** callback_at har passerat (CallbackReminderWorker, redan finns)
- **Text:** "Callback förfallen — {företag}"
- **Inline action:** Ring nu (öppnar kunden i dialern)
- **Email:** Ja (redan implementerat)

### 4. Mål uppnått
- **Trigger:** Agentens dagliga/vecko-mål nått (calls_per_day, meetings_per_week)
- **Text:** "Mål uppnått! {metric} — {target_value}"
- **Action:** Bara visuell (celebratory)
- **Email:** Nej

## UI — Dropdown-panel

Klockan i dialer-headern (redan finns). Klick öppnar dropdown:

```
┌────────────────────────────┐
│ 🔔 Notiser           3 nya │
├────────────────────────────┤
│ ● Möte om 15 min          │
│   Acme AB — 14:30          │
│                    [Öppna] │
├────────────────────────────┤
│ ○ Uppdatera mötesstatus   │
│   Frisör AB (igår)         │
│   [Genomförd] [No-show]   │
├────────────────────────────┤
│ ○ Callback förfallen      │
│   Nails AB — 09:00         │
│               [Ring nu]    │
├────────────────────────────┤
│ ✓ Mål uppnått! 🎉         │
│   50 samtal idag           │
└────────────────────────────┘
```

- ● = oläst, ○ = läst
- Inline action-knappar per notis-typ
- Klick på notisen → öppnar relevant vy i dialern
- "Markera alla som lästa" länk i headern

## Backend

### Ny tabell: `notifications`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | uuid | PK |
| user_id | uuid | FK → users |
| type | string | "meeting_soon", "meeting_update", "callback_due", "goal_reached" |
| title | string | Kort rubrik |
| body | string | Beskrivning |
| resource_type | string | "Meeting", "Lead", "Goal" |
| resource_id | uuid | FK till resursen |
| read_at | timestamp | NULL = oläst |
| inserted_at | timestamp | |

### Ny Ash resource: `Saleflow.Notifications.Notification`
- Actions: create, read, mark_read, mark_all_read, list_for_user

### Ny worker: `MeetingStatusWorker`
- Kör var 15:e minut
- Hittar meetings: status=scheduled, meeting_time + 1h < now, ingen "meeting_update"-notis skapad
- Skapar notification + broadcastar via PubSub

### Uppdatera befintliga workers
- **MeetingReminderWorker:** Skapa notification + email (idag bara email)
- **CallbackReminderWorker:** Skapa notification + email (idag bara email)

### Ny worker: `GoalCheckWorker`
- Kör var 10:e minut
- Kollar alla aktiva mål, jämför current_value vs target_value
- Om uppnått och ingen "goal_reached"-notis finns → skapa

### API-endpoints
- `GET /api/notifications` — lista notiser (olästa först, senaste 50)
- `POST /api/notifications/:id/read` — markera som läst
- `POST /api/notifications/read-all` — markera alla som lästa

### WebSocket
- Ny kanal `notifications:#{user_id}` 
- Workers broadcastar `{:new_notification, notification}` efter create
- Frontend lyssnar och uppdaterar badge + dropdown

## Frontend

### Ny komponent: `NotificationDropdown`
- Renderas i DialerHeader vid klockan
- State: öppen/stängd
- Hämtar: `useNotifications()` hook
- Badge: antal olästa
- Lista: notiser med inline actions
- Klick utanför → stäng

### Ny API-hook: `useNotifications()`
- `GET /api/notifications`
- Refetch var 30:e sekund (fallback om WebSocket inte funkar)
- Mutation: `useMarkRead()`, `useMarkAllRead()`

### Actions per typ
- **meeting_soon:** Klick → `setActiveTab("meeting-detail")` + `setSelectedMeetingId(id)`
- **meeting_update:** Inline knappar → anropa `useUpdateMeeting` med status
- **callback_due:** "Ring nu" → `setCurrentLeadId(lead_id)` + `setActiveTab("dialer")`
- **goal_reached:** Bara visuell, inget klick-beteende

## Livstid
- Olästa notiser finns kvar tills agenten läser dem
- Lästa notiser visas i dropdown men gråade ut
- Ingen automatisk rensning (kan lägga till senare)
