# SaleFlow Security + Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email notifications (Resend), 2FA (email OTP), login session tracking with GeoIP/device info, admin force-logout, and meeting/callback reminders.

**Architecture:** New Notifications domain for email via Resend API. OtpCode + LoginSession resources in Accounts domain. Modified auth plug to use session tokens. GeoIP + UA parsing utilities. Two new Oban reminder workers. Frontend OTP login flow + profile page + admin session management.

**Tech Stack:** Resend API (via Req), ua_parser, ip-api.com, Oban cron, EEx templates

---

## Task Overview

| # | Task | Scope |
|---|------|-------|
| 1 | Resend mailer + email templates | Backend: notifications domain |
| 2 | OTP resource + generation/verification | Backend: accounts domain |
| 3 | LoginSession resource + UA/GeoIP parsing | Backend: accounts domain |
| 4 | Modify auth flow (sign-in → OTP → session) | Backend: controllers + plug |
| 5 | Session management API endpoints | Backend: controllers + router |
| 6 | Meeting + callback reminder workers | Backend: Oban workers |
| 7 | Add reminded_at/callback_reminded_at fields | Backend: migrations |
| 8 | Frontend: OTP login flow | Frontend: login page |
| 9 | Frontend: profile + admin sessions | Frontend: pages |
| 10 | Backend tests 100% + frontend tests 100% | Tests |

---

### Task 1: Resend mailer + email templates

**Files:**
- Create: `backend/lib/saleflow/notifications/notifications.ex`
- Create: `backend/lib/saleflow/notifications/mailer.ex`
- Create: `backend/lib/saleflow/notifications/templates.ex`
- Create: `backend/lib/saleflow/notifications/templates/layout.html.eex`
- Create: `backend/lib/saleflow/notifications/templates/otp_code.html.eex`
- Create: `backend/lib/saleflow/notifications/templates/welcome.html.eex`
- Create: `backend/lib/saleflow/notifications/templates/force_logout.html.eex`
- Create: `backend/lib/saleflow/notifications/templates/meeting_reminder.html.eex`
- Create: `backend/lib/saleflow/notifications/templates/callback_reminder.html.eex`
- Create: `backend/test/saleflow/notifications/mailer_test.exs`
- Create: `backend/test/saleflow/notifications/templates_test.exs`
- Modify: `backend/mix.exs` — add `{:req, "~> 0.5"}`
- Modify: `backend/config/config.exs` — add Resend config
- Modify: `backend/config/test.exs` — add test mailer config (sandbox mode)

**Implementation:**

`notifications.ex` — Ash domain (empty resources for now, just the module).

`mailer.ex`:
```elixir
defmodule Saleflow.Notifications.Mailer do
  @doc "Send email via Resend API. Returns {:ok, email_id} or {:error, reason}."

  def send_email(to, subject, html_body) do
    api_key = Application.get_env(:saleflow, :resend_api_key)
    from = Application.get_env(:saleflow, :resend_from, "SaleFlow <noreply@saleflow.se>")

    case Req.post("https://api.resend.com/emails",
      json: %{from: from, to: [to], subject: subject, html: html_body},
      headers: [{"authorization", "Bearer #{api_key}"}]
    ) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        {:ok, body["id"]}
      {:ok, %{status: status, body: body}} ->
        {:error, {status, body}}
      {:error, reason} ->
        {:error, reason}
    end
  end

  def send_email_async(to, subject, html_body) do
    Task.start(fn -> send_email(to, subject, html_body) end)
    :ok
  end
end
```

In test config, add a mock/sandbox mode:
```elixir
config :saleflow, :resend_api_key, "re_test_sandbox"
config :saleflow, :mailer_sandbox, true
```

Mailer checks `Application.get_env(:saleflow, :mailer_sandbox)` — if true, logs the email instead of sending.

`templates.ex` — pure functions that render EEx:
```elixir
defmodule Saleflow.Notifications.Templates do
  @templates_dir Path.join(:code.priv_dir(:saleflow), "templates/email")

  def render_otp_code(code) do
    subject = "Din inloggningskod: #{code}"
    html = render("otp_code", %{code: code})
    {subject, html}
  end

  def render_welcome(name, login_url) do
    subject = "Välkommen till SaleFlow"
    html = render("welcome", %{name: name, login_url: login_url})
    {subject, html}
  end

  def render_force_logout(name) do
    subject = "Du har loggats ut"
    html = render("force_logout", %{name: name})
    {subject, html}
  end

  def render_meeting_reminder(title, date, time, company) do
    subject = "Mötespåminnelse: #{title}"
    html = render("meeting_reminder", %{title: title, date: date, time: time, company: company})
    {subject, html}
  end

  def render_callback_reminder(company, phone, callback_time) do
    subject = "Återuppringning: #{company}"
    html = render("callback_reminder", %{company: company, phone: phone, callback_time: callback_time})
    {subject, html}
  end

  defp render(template_name, assigns) do
    layout = File.read!(Path.join(@templates_dir, "layout.html.eex"))
    content = File.read!(Path.join(@templates_dir, "#{template_name}.html.eex"))
    inner = EEx.eval_string(content, assigns: assigns)
    EEx.eval_string(layout, assigns: %{content: inner})
  end
end
```

EEx templates in `backend/priv/templates/email/` (not lib — runtime read):

`layout.html.eex`:
```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Inter,-apple-system,sans-serif;background:#F8FAFC;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:24px;font-weight:600;color:#4F46E5;">SaleFlow</span>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:32px;">
      <%= @content %>
    </div>
    <p style="text-align:center;margin-top:24px;font-size:12px;color:#64748B;">
      SaleFlow — Säljverktyg
    </p>
  </div>
</body>
</html>
```

`otp_code.html.eex`:
```html
<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Din inloggningskod</h2>
<p style="margin:0 0 24px;font-size:14px;color:#64748B;">Ange koden nedan för att logga in:</p>
<div style="text-align:center;padding:20px;background:#F8FAFC;border-radius:8px;margin-bottom:24px;">
  <span style="font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:600;letter-spacing:8px;color:#0F172A;">
    <%= @code %>
  </span>
</div>
<p style="margin:0;font-size:12px;color:#64748B;">Koden gäller i 5 minuter.</p>
```

`welcome.html.eex`:
```html
<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Välkommen, <%= @name %>!</h2>
<p style="margin:0 0 24px;font-size:14px;color:#64748B;">Ditt konto på SaleFlow har skapats. Logga in här:</p>
<div style="text-align:center;margin-bottom:24px;">
  <a href="<%= @login_url %>" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:500;font-size:14px;">
    Logga in
  </a>
</div>
```

`force_logout.html.eex`:
```html
<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Du har loggats ut</h2>
<p style="margin:0 0 16px;font-size:14px;color:#64748B;">
  Hej <%= @name %>, en administratör har loggat ut dig från SaleFlow.
</p>
<p style="margin:0;font-size:14px;color:#64748B;">
  Om du inte förväntar dig detta, kontakta din administratör.
</p>
```

`meeting_reminder.html.eex`:
```html
<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Mötespåminnelse</h2>
<p style="margin:0 0 16px;font-size:14px;color:#64748B;">Du har ett möte som börjar snart:</p>
<div style="background:#F8FAFC;border-radius:8px;padding:16px;margin-bottom:16px;">
  <p style="margin:0 0 8px;font-size:14px;"><strong><%= @title %></strong></p>
  <p style="margin:0 0 4px;font-size:14px;color:#64748B;">Företag: <%= @company %></p>
  <p style="margin:0;font-size:14px;color:#64748B;">Tid: <%= @date %> kl. <%= @time %></p>
</div>
```

`callback_reminder.html.eex`:
```html
<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Dags att ringa tillbaka</h2>
<p style="margin:0 0 16px;font-size:14px;color:#64748B;">Du har en planerad återuppringning:</p>
<div style="background:#F8FAFC;border-radius:8px;padding:16px;margin-bottom:16px;">
  <p style="margin:0 0 8px;font-size:14px;"><strong><%= @company %></strong></p>
  <p style="margin:0 0 4px;font-family:'JetBrains Mono',monospace;font-size:14px;color:#4F46E5;"><%= @phone %></p>
  <p style="margin:0;font-size:14px;color:#64748B;">Tid: <%= @callback_time %></p>
</div>
```

**Tests:**
- Templates: each render function returns {subject, html} with correct content
- Mailer: mock Req.post, verify correct API call, test sandbox mode, test error handling
- 15+ tests

**Commit:** `feat: add Resend mailer + 5 email templates`

---

### Task 2: OTP resource + generation/verification

**Files:**
- Create: `backend/lib/saleflow/accounts/otp_code.ex`
- Create: `backend/test/saleflow/accounts/otp_code_test.exs`
- Modify: `backend/lib/saleflow/accounts/accounts.ex` — add OTP functions

**OtpCode resource:**
- Table: `otp_codes`
- Fields: id, user_id, code (6 digits), expires_at (now + 5 min), used_at (nullable), inserted_at
- Actions: create (generates code, invalidates old), verify (checks code + expiry + unused, marks used)
- Audit logging on create + verify

**Domain functions:**
```elixir
def create_otp(user) — generates OTP, sends email, returns {:ok, otp}
def verify_otp(user_id, code) — verifies code, returns {:ok, user} or {:error, reason}
def invalidate_otps(user_id) — marks all active OTPs as used
```

**Tests (15+):**
- create_otp generates 6-digit code
- create_otp sets expires_at 5 min in future
- create_otp invalidates previous active OTPs
- verify_otp succeeds with correct code
- verify_otp fails with wrong code
- verify_otp fails with expired code
- verify_otp fails with already-used code
- verify_otp marks code as used
- rate limit: 6th attempt within 15 min fails
- audit log on create + verify

**Commit:** `feat: add OTP code resource with generation and verification`

---

### Task 3: LoginSession resource + UA/GeoIP

**Files:**
- Create: `backend/lib/saleflow/accounts/login_session.ex`
- Create: `backend/lib/saleflow/auth/geo_ip.ex`
- Create: `backend/lib/saleflow/auth/user_agent_parser.ex`
- Create: `backend/test/saleflow/accounts/login_session_test.exs`
- Create: `backend/test/saleflow/auth/geo_ip_test.exs`
- Create: `backend/test/saleflow/auth/user_agent_parser_test.exs`
- Modify: `backend/mix.exs` — add `{:ua_parser, "~> 1.8"}`
- Modify: `backend/lib/saleflow/accounts/accounts.ex` — add session functions

**LoginSession resource:**
- Table: `login_sessions`
- Fields: id, user_id, session_token (unique), ip_address, user_agent, device_type, browser, city, country, logged_in_at, last_active_at, logged_out_at, force_logged_out (bool, default false)
- Actions: create, touch (update last_active_at), logout, force_logout, list_active_for_user, list_all_for_user
- Audit logging on create, logout, force_logout

**GeoIP module:**
```elixir
defmodule Saleflow.Auth.GeoIP do
  def lookup(ip_address) do
    case Req.get("http://ip-api.com/json/#{ip_address}") do
      {:ok, %{status: 200, body: %{"status" => "success"} = body}} ->
        {:ok, %{city: body["city"], country: body["country"]}}
      _ ->
        {:ok, %{city: nil, country: nil}}
    end
  end
end
```

**UserAgentParser module:**
```elixir
defmodule Saleflow.Auth.UserAgentParser do
  def parse(ua_string) when is_binary(ua_string) do
    ua = UAParser.parse(ua_string)
    %{
      device_type: detect_device_type(ua),
      browser: "#{ua.family} #{ua.version}"
    }
  end

  def parse(_), do: %{device_type: "unknown", browser: "unknown"}

  defp detect_device_type(ua) do
    cond do
      String.contains?(to_string(ua.device.family), ["iPhone", "Android"]) -> "mobile"
      String.contains?(to_string(ua.device.family), ["iPad", "Tablet"]) -> "tablet"
      true -> "desktop"
    end
  end
end
```

**Domain functions:**
```elixir
def create_login_session(user, conn) — creates session with parsed UA + GeoIP
def touch_session(session) — updates last_active_at
def logout_session(session) — sets logged_out_at
def force_logout_session(session) — sets logged_out_at + force_logged_out, sends email
def force_logout_all(user) — force-logouts all active sessions
def list_active_sessions(user_id) — active sessions for user
def list_all_sessions(user_id) — all sessions for user
def find_session_by_token(token) — lookup by session_token
```

**Tests (20+):**
- LoginSession: create, touch, logout, force_logout, list_active, list_all
- GeoIP: successful lookup, failed lookup returns nils, localhost returns nils
- UserAgentParser: desktop Chrome, mobile iPhone, tablet iPad, unknown UA
- Audit logs on session events

**Commit:** `feat: add LoginSession + GeoIP + UA parsing`

---

### Task 4: Modify auth flow (sign-in → OTP → session token)

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/auth_controller.ex`
- Modify: `backend/lib/saleflow_web/plugs/require_auth.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Modify: `backend/test/saleflow_web/controllers/auth_controller_test.exs`

**Auth controller changes:**

`sign_in` now:
1. Validates email + password
2. Creates OTP + sends email
3. Returns `{otp_sent: true, user_id: user.id}` (NO session)

New `verify_otp` action:
1. Receives user_id + code
2. Verifies OTP
3. Creates LoginSession (with IP, UA, GeoIP)
4. Puts session_token in cookie
5. Returns `{user: ...}`

**RequireAuth plug changes:**
1. Gets `session_token` from session (not `user_id`)
2. Calls `Accounts.find_session_by_token(token)`
3. Checks `logged_out_at` is nil
4. Calls `Accounts.touch_session(session)` to update last_active_at
5. Loads user from session.user_id
6. If force-logged-out → 401 + clear session

**Router:**
- Add `POST /api/auth/verify-otp` to public scope

**Tests (20+):**
- sign-in returns otp_sent: true (no session)
- sign-in with bad password returns 401
- verify-otp with valid code returns user + sets session
- verify-otp with wrong code returns 401
- verify-otp with expired code returns 401
- authenticated request works with valid session token
- authenticated request fails with force-logged-out session
- last_active_at updated on each request
- all existing controller tests updated for new 2-step flow

**CRITICAL: Update ALL existing tests** that use the old auth flow (put_session user_id). They must now:
1. Create a LoginSession
2. Put session_token in session instead of user_id

Update the `ConnCase` helper `register_and_log_in_user` to handle the new flow.

**Commit:** `feat: modify auth to 2-step OTP flow with session tokens`

---

### Task 5: Session management API endpoints

**Files:**
- Create: `backend/lib/saleflow_web/controllers/session_controller.ex`
- Modify: `backend/lib/saleflow_web/controllers/admin_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Create: `backend/test/saleflow_web/controllers/session_controller_test.exs`

**SessionController:**
- `index` — GET /api/auth/sessions — list my active sessions
- `logout_all` — POST /api/auth/sessions/logout-all — logout all my sessions (except current)

**AdminController additions:**
- `user_sessions` — GET /api/admin/users/:user_id/sessions — list all sessions for a user
- `force_logout_user` — POST /api/admin/users/:user_id/force-logout — force-logout all sessions
- `force_logout_session` — POST /api/admin/sessions/:id/force-logout — force-logout single session

**Serialization for sessions:**
```elixir
%{
  id: session.id,
  device_type: session.device_type,
  browser: session.browser,
  city: session.city,
  country: session.country,
  ip_address: session.ip_address,
  logged_in_at: session.logged_in_at,
  last_active_at: session.last_active_at,
  force_logged_out: session.force_logged_out,
  current: session.session_token == current_token
}
```

**Tests (15+):**
- List my sessions returns correct data
- Logout-all logs out other sessions but not current
- Admin list user sessions works
- Admin force-logout user logs out all + sends emails
- Admin force-logout single session works
- Agent cannot access admin session endpoints (403)
- Force-logged-out session returns 401 on next request

**Commit:** `feat: add session management endpoints`

---

### Task 6: Add reminded_at fields to Meeting + Lead

**Files:**
- Modify: `backend/lib/saleflow/sales/meeting.ex` — add `reminded_at` attribute
- Modify: `backend/lib/saleflow/sales/lead.ex` — add `callback_reminded_at` attribute
- Generate migration

Small task: add `reminded_at` (utc_datetime_usec, nullable) to Meeting and `callback_reminded_at` (utc_datetime_usec, nullable) to Lead. Add update actions to set these fields. Run migration.

**Tests:** Verify fields exist and can be set.

**Commit:** `feat: add reminded_at fields for reminder workers`

---

### Task 7: Meeting + callback reminder workers

**Files:**
- Create: `backend/lib/saleflow/workers/meeting_reminder_worker.ex`
- Create: `backend/lib/saleflow/workers/callback_reminder_worker.ex`
- Create: `backend/test/saleflow/workers/meeting_reminder_worker_test.exs`
- Create: `backend/test/saleflow/workers/callback_reminder_worker_test.exs`
- Modify: `backend/config/config.exs` — add cron entries

**MeetingReminderWorker:**
- Runs `*/5 * * * *`
- Query: meetings WHERE status = :scheduled AND meeting_date = today AND meeting_time between now and now+65min AND reminded_at IS NULL
- For each: send meeting_reminder email, set reminded_at = now
- Loads user email for the meeting's user_id

**CallbackReminderWorker:**
- Runs `*/5 * * * *`
- Query: leads WHERE status = :callback AND callback_at between now and now+20min AND callback_reminded_at IS NULL
- For each: find assigned agent, send callback_reminder email, set callback_reminded_at = now

**Tests (15+):**
- Meeting reminder: sends for meeting within 1 hour, not for meeting 2 hours away, not for already reminded, not for cancelled
- Callback reminder: sends for callback within 15 min, not for past callback, not for already reminded
- Both: correct email content, audit log created
- Both: return :ok

**Commit:** `feat: add meeting + callback reminder workers`

---

### Task 8: Frontend — OTP login flow

**Files:**
- Create: `frontend/src/components/otp-input.tsx`
- Modify: `frontend/src/pages/login.tsx`
- Modify: `frontend/src/api/auth.ts`
- Modify: `frontend/src/api/types.ts`

**New OTP input component:**
6 individual digit inputs. Auto-focus next on input. Auto-submit when all 6 filled. Paste support (paste full code). "Skicka ny kod" link. Matches design system.

**Modified login flow:**
```
State: "credentials" | "otp"

credentials step:
  - Email + password form (existing)
  - On submit → call sign-in → get {otp_sent, user_id}
  - Transition to "otp" step

otp step:
  - "Kod skickad till din e-post" message
  - OTP input (6 digits)
  - "Skicka ny kod" link → re-calls sign-in
  - On complete → call verify-otp → get {user} → redirect
  - Error: "Fel kod" / "Koden har gått ut"
```

**API changes:**
- `useLogin` mutation now returns `{otp_sent: true, user_id: string}`
- New `useVerifyOtp` mutation: POST /api/auth/verify-otp with {user_id, code}
- `useResendOtp` mutation: re-calls sign-in with same credentials

**Types:**
```typescript
interface LoginResponse { otp_sent: boolean; user_id: string; }
interface VerifyOtpResponse { user: User; }
```

**UX Details:**
- OTP inputs: 6 boxes, 48px square each, centered, mono font, border-input, focus ring
- Auto-advance cursor on digit entry
- Backspace goes to previous input
- Paste fills all 6
- "Skicka ny kod" in text-secondary, underline on hover
- Error text in danger color below inputs

**Commit:** `feat: add OTP login flow to frontend`

---

### Task 9: Frontend — Profile page + admin sessions

**Files:**
- Create: `frontend/src/pages/profile.tsx`
- Create: `frontend/src/components/session-list.tsx`
- Create: `frontend/src/api/sessions.ts`
- Modify: `frontend/src/pages/admin-users.tsx`
- Modify: `frontend/src/app.tsx` — add /profile route
- Modify: `frontend/src/components/sidebar.tsx` — add Profil link
- Modify: `frontend/src/components/topbar.tsx` — link to /profile

**Session API hooks:**
```typescript
useMySessions() — GET /api/auth/sessions
useLogoutAll() — POST /api/auth/sessions/logout-all
useUserSessions(userId) — GET /api/admin/users/:id/sessions
useForceLogoutUser(userId) — POST /api/admin/users/:id/force-logout
useForceLogoutSession() — POST /api/admin/sessions/:id/force-logout
```

**SessionList component (shared between profile + admin):**
- Table: device icon (desktop/mobile/tablet from lucide-react), browser name, city + country, last active (relative: "just nu", "5 min sedan", "2 timmar sedan"), "Nuvarande" badge on current session
- "Logga ut" danger button per row (not on current session)
- Design system compliance: table with slate-50 header, no borders

**Profile page (/profile):**
- Card with name, email, role badge
- Card with "Mina sessioner" + SessionList
- "Logga ut överallt" danger button

**Admin users page (modified):**
- Expandable row per user
- Click "Visa sessioner" → expands to show SessionList for that user
- "Logga ut alla" button per user

**Sidebar:** Add "Profil" link for all users (between Historik and admin section)

**Topbar:** User name becomes a link to /profile

**Commit:** `feat: add profile page + admin session management`

---

### Task 10: Full test coverage (backend + frontend)

**Files:**
- All new test files from tasks 1-9
- Additional tests to reach 100%

**Backend target: 100% coverage**
Run `mix test --cover`, identify any uncovered lines, write tests.

Key areas needing thorough testing:
- Mailer sandbox mode vs real mode
- OTP edge cases (concurrent creation, race conditions)
- LoginSession with force-logout chain (force → next request → 401)
- GeoIP fallback on error
- UA parser with various user agent strings
- Reminder workers with various meeting/callback times
- All new API endpoints with auth + admin guards

**Frontend target: 100% coverage**
Run `npx vitest run --coverage`, identify gaps.

Key areas:
- OTP input: typing, paste, backspace, auto-submit, error states
- Login two-step flow: credentials → OTP → success/error
- Session list: current session badge, force-logout button, relative time
- Profile page: logout-all
- Admin session management: expand/collapse, force-logout

**E2E updates:**
- Update existing auth E2E for 2-step flow
- Add E2E for admin force-logout

**Commit:** `feat: achieve 100% test coverage for security + notifications`

---

## Summary

| Task | Backend files | Frontend files | Tests target |
|------|--------------|----------------|-------------|
| 1 | 8 new | — | 15+ |
| 2 | 2 new, 1 modified | — | 15+ |
| 3 | 4 new, 1 modified | — | 20+ |
| 4 | 3 modified | — | 20+ |
| 5 | 2 new, 2 modified | — | 15+ |
| 6 | 2 modified | — | 5+ |
| 7 | 2 new, 1 modified | — | 15+ |
| 8 | — | 3 new, 3 modified | 15+ |
| 9 | — | 4 new, 4 modified | 15+ |
| 10 | coverage gap-fill | coverage gap-fill | 100% |

**Total: ~150+ new tests across backend + frontend**
