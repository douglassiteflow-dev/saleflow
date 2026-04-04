# Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app notification system with DB persistence, real-time WebSocket push, and a dropdown panel in the dialer header — covering meeting reminders, meeting status updates, callback reminders, and goal achievements.

**Architecture:** New `Notification` Ash resource with `notifications` table. New `NotificationChannel` for per-user WebSocket push. Existing workers (MeetingReminder, CallbackReminder) enhanced to create notifications. Two new workers: `MeetingStatusWorker` (detect overdue meetings) and `GoalCheckWorker` (detect goal achievements). Frontend: `NotificationDropdown` component with inline actions, mounted in dialer header.

**Tech Stack:** Elixir/Phoenix, Ash Framework, Oban Workers, Phoenix Channels/PubSub, React, TanStack Query

---

### Task 1: Backend — Notification resource + migration

**Files:**
- Create: `backend/lib/saleflow/notifications/notifications.ex` (Ash domain)
- Create: `backend/lib/saleflow/notifications/notification.ex` (Ash resource)
- Modify: `backend/config/config.exs` (add domain)
- Create: migration

- [ ] **Step 1: Create Notifications domain**

```elixir
# backend/lib/saleflow/notifications/notifications.ex
defmodule Saleflow.Notifications do
  use Ash.Domain

  resources do
    resource Saleflow.Notifications.Notification
  end
end
```

Add `Saleflow.Notifications` to `ash_domains` in `config/config.exs`.

NOTE: There is already a `Saleflow.Notifications` module at `lib/saleflow/notifications/` for the Mailer. Check if it conflicts — the Mailer module is `Saleflow.Notifications.Mailer` and `Saleflow.Notifications.Templates`, so the domain module needs a different name. Use `Saleflow.Notifs` as the domain name to avoid conflict, OR create the resource inside the Sales domain. **Read the existing code first to decide.**

- [ ] **Step 2: Create Notification resource**

```elixir
# backend/lib/saleflow/notifications/notification.ex
defmodule Saleflow.Notifications.Notification do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: <chosen_domain>

  postgres do
    table "notifications"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid, allow_nil?: false, public?: true
    attribute :type, :string, allow_nil?: false, public?: true
    attribute :title, :string, allow_nil?: false, public?: true
    attribute :body, :string, allow_nil?: true, public?: true
    attribute :resource_type, :string, allow_nil?: true, public?: true
    attribute :resource_id, :uuid, allow_nil?: true, public?: true
    attribute :read_at, :utc_datetime_usec, allow_nil?: true, public?: true

    create_timestamp :inserted_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [:user_id, :type, :title, :body, :resource_type, :resource_id]
    end

    update :mark_read do
      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :read_at, DateTime.utc_now())
      end
    end

    read :for_user do
      argument :user_id, :uuid, allow_nil?: false
      filter expr(user_id == ^arg(:user_id))
      prepare build(sort: [inserted_at: :desc], limit: 50)
    end

    read :unread_for_user do
      argument :user_id, :uuid, allow_nil?: false
      filter expr(user_id == ^arg(:user_id) and is_nil(read_at))
      prepare build(sort: [inserted_at: :desc])
    end
  end
end
```

- [ ] **Step 3: Generate and write migration**

```bash
cd backend && mix ecto.gen.migration create_notifications
```

```elixir
defmodule Saleflow.Repo.Migrations.CreateNotifications do
  use Ecto.Migration

  def change do
    create table(:notifications, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :type, :text, null: false
      add :title, :text, null: false
      add :body, :text
      add :resource_type, :text
      add :resource_id, :uuid
      add :read_at, :utc_datetime_usec
      add :inserted_at, :utc_datetime_usec, null: false, default: fragment("now()")
    end

    create index(:notifications, [:user_id, :read_at])
    create index(:notifications, [:user_id, :inserted_at])
  end
end
```

Run: `mix ecto.migrate`

- [ ] **Step 4: Create helper module for creating + broadcasting notifications**

```elixir
# backend/lib/saleflow/notifications/notify.ex
defmodule Saleflow.Notifications.Notify do
  @moduledoc "Helper to create a notification and broadcast it via PubSub."

  def send(attrs) do
    case <Notification resource> |> Ash.Changeset.for_create(:create, attrs) |> Ash.create() do
      {:ok, notification} ->
        Phoenix.PubSub.broadcast(
          Saleflow.PubSub,
          "notifications:#{attrs.user_id}",
          {:new_notification, serialize(notification)}
        )
        {:ok, notification}

      error -> error
    end
  end

  defp serialize(n) do
    %{
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      resource_type: n.resource_type,
      resource_id: n.resource_id,
      read_at: n.read_at,
      inserted_at: n.inserted_at
    }
  end
end
```

- [ ] **Step 5: Run tests, commit**

Run: `mix test`
Commit: `feat: add Notification resource with migration and Notify helper`

---

### Task 2: Backend — Notification controller + WebSocket channel

**Files:**
- Create: `backend/lib/saleflow_web/controllers/notification_controller.ex`
- Create: `backend/lib/saleflow_web/channels/notification_channel.ex`
- Modify: `backend/lib/saleflow_web/channels/user_socket.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Create: `backend/test/saleflow_web/controllers/notification_controller_test.exs`

- [ ] **Step 1: Create NotificationController**

Actions: `index` (list for current user), `mark_read` (single), `mark_all_read`.

- [ ] **Step 2: Create NotificationChannel**

```elixir
# backend/lib/saleflow_web/channels/notification_channel.ex
defmodule SaleflowWeb.NotificationChannel do
  use Phoenix.Channel

  @impl true
  def join("notifications:" <> user_id, _payload, socket) do
    if socket.assigns.user_id == user_id do
      {:ok, socket}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end

  @impl true
  def handle_info({:new_notification, notification}, socket) do
    push(socket, "new_notification", notification)
    {:noreply, socket}
  end
end
```

- [ ] **Step 3: Register channel in UserSocket**

Add: `channel "notifications:*", SaleflowWeb.NotificationChannel`

- [ ] **Step 4: Add routes**

In authenticated scope:
```elixir
get "/notifications", NotificationController, :index
post "/notifications/:id/read", NotificationController, :mark_read
post "/notifications/read-all", NotificationController, :mark_all_read
```

- [ ] **Step 5: Write tests, run, commit**

Commit: `feat: add NotificationController and WebSocket channel`

---

### Task 3: Backend — Enhance existing workers to create notifications

**Files:**
- Modify: `backend/lib/saleflow/workers/meeting_reminder_worker.ex`
- Modify: `backend/lib/saleflow/workers/callback_reminder_worker.ex`

- [ ] **Step 1: MeetingReminderWorker — add notification creation**

In `send_reminder/1`, after sending email and before audit log, add:

```elixir
Saleflow.Notifications.Notify.send(%{
  user_id: user.id,
  type: "meeting_soon",
  title: "Möte om 15 min",
  body: "#{company} — #{time_str}",
  resource_type: "Meeting",
  resource_id: meeting_id
})
```

- [ ] **Step 2: CallbackReminderWorker — add notification creation**

In `send_reminder/1`, after sending email:

```elixir
Saleflow.Notifications.Notify.send(%{
  user_id: user.id,
  type: "callback_due",
  title: "Callback förfallen",
  body: "#{lead.företag} — #{callback_time}",
  resource_type: "Lead",
  resource_id: lead_id
})
```

- [ ] **Step 3: Run tests, commit**

Commit: `feat: meeting and callback workers create in-app notifications`

---

### Task 4: Backend — MeetingStatusWorker (new)

**Files:**
- Create: `backend/lib/saleflow/workers/meeting_status_worker.ex`
- Modify: `backend/config/config.exs` (add Oban cron)

- [ ] **Step 1: Create MeetingStatusWorker**

Runs every 15 minutes. Finds meetings where:
- status = scheduled
- meeting_date + meeting_time + 1 hour < now
- No existing notification with type="meeting_update" for this meeting+user

Creates notification with inline actions (Genomförd, No-show, Boka om).

Also runs daily check: meetings where meeting_date < today, status still scheduled, creates escalation notification.

- [ ] **Step 2: Register in Oban cron**

Add to Oban config: `{"*/15 * * * *", Saleflow.Workers.MeetingStatusWorker}`

- [ ] **Step 3: Test, commit**

Commit: `feat: add MeetingStatusWorker for overdue meeting notifications`

---

### Task 5: Backend — GoalCheckWorker (new)

**Files:**
- Create: `backend/lib/saleflow/workers/goal_check_worker.ex`
- Modify: `backend/config/config.exs` (add Oban cron)

- [ ] **Step 1: Create GoalCheckWorker**

Runs every 10 minutes. For each user with active goals:
- Calculate current value (reuse Stats module)
- If current_value >= target_value AND no "goal_reached" notification exists for this goal today → create notification

- [ ] **Step 2: Register in Oban cron**

Add: `{"*/10 * * * *", Saleflow.Workers.GoalCheckWorker}`

- [ ] **Step 3: Test, commit**

Commit: `feat: add GoalCheckWorker for goal achievement notifications`

---

### Task 6: Frontend — Notification API hooks

**Files:**
- Create: `frontend/src/api/notifications.ts`
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add types**

```typescript
export interface Notification {
  id: string;
  type: "meeting_soon" | "meeting_update" | "callback_due" | "goal_reached";
  title: string;
  body: string | null;
  resource_type: string | null;
  resource_id: string | null;
  read_at: string | null;
  inserted_at: string;
}
```

- [ ] **Step 2: Create hooks**

`useNotifications()`, `useMarkRead()`, `useMarkAllRead()`, `useUnreadCount()`.

Refetch every 30s as fallback.

- [ ] **Step 3: TypeScript check, commit**

Commit: `feat: add notification API hooks and types`

---

### Task 7: Frontend — NotificationDropdown component

**Files:**
- Create: `frontend/src/components/dialer/notification-dropdown.tsx`
- Modify: `frontend/src/components/dialer/dialer-header.tsx`
- Modify: `frontend/src/pages/dialer.tsx`

- [ ] **Step 1: Create NotificationDropdown**

Dropdown panel that opens from bell icon. Shows:
- Header: "Notiser" + unread count + "Markera alla"
- List of notifications with:
  - ● (unread) / ○ (read) indicator
  - Title + body + relative time
  - Inline actions per type:
    - meeting_soon: "Öppna" → opens meeting detail
    - meeting_update: "Genomförd" / "No-show" / "Boka om" buttons
    - callback_due: "Ring nu" → loads lead in dialer
    - goal_reached: celebratory styling, no actions
- Click outside → close

- [ ] **Step 2: Integrate in DialerHeader**

Replace current bell button with NotificationDropdown. Pass callbacks for:
- onOpenMeeting(id)
- onOpenLead(id)
- onUpdateMeetingStatus(id, status)

- [ ] **Step 3: Wire up in dialer.tsx**

Pass handlers from DialerPage that set appropriate tabs/state when notification actions fire.

- [ ] **Step 4: TypeScript check, commit**

Commit: `feat: add NotificationDropdown with inline actions in dialer header`

---

### Task 8: Frontend — WebSocket integration

**Files:**
- Modify: `frontend/src/lib/socket.ts`
- Modify: `frontend/src/components/dialer/notification-dropdown.tsx`

- [ ] **Step 1: Add joinNotificationChannel to socket.ts**

```typescript
export function joinNotificationChannel(
  userId: string,
  onNotification: (notification: Notification) => void
) {
  const channel = socket.channel(`notifications:${userId}`, {});
  channel.join();
  channel.on("new_notification", (payload) => {
    onNotification(payload);
  });
  return channel;
}
```

- [ ] **Step 2: Connect in NotificationDropdown or dialer.tsx**

On mount, join channel. On new_notification, invalidate React Query cache to trigger re-fetch + show toast/badge update.

- [ ] **Step 3: Test, commit**

Commit: `feat: real-time notification push via WebSocket`

---

### Task 9: Deploy + verify

- [ ] **Step 1: Run full test suite**

```bash
cd backend && mix test
cd frontend && npx tsc --noEmit
```

- [ ] **Step 2: Deploy**

```bash
cd /Users/douglassiteflow/dev/saleflow
fly deploy --app saleflow-app
fly ssh console --app saleflow-app -C "/app/bin/saleflow eval 'Saleflow.Release.migrate()'"
```

- [ ] **Step 3: Verify**

- Open dialer → bell shows 0
- Create a meeting for 15 min from now → notification appears
- Callback with passed callback_at → notification appears
- Click notification actions → correct behavior
