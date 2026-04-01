# SaleFlow Security + Notifications — Design Spec

## Overview

Add email notifications (via Resend), 2FA (email OTP), login session tracking with GeoIP, and admin force-logout capabilities.

## Stack Additions
- Resend API for transactional email (via `req` HTTP client)
- GeoIP lookup (free API: ip-api.com)
- User agent parsing (ua_parser library)

---

## Domain: Notifications

### EmailTemplate (module, not resource — pure functions)

5 templates, each returns `{subject, html_body}`:

| Template | Trigger | Content |
|----------|---------|---------|
| `otp_code` | Login step 2 | 6-digit code, expires in 5 min |
| `welcome` | Admin creates user | Welcome text, login URL |
| `force_logout` | Admin force-logouts session | "Du har loggats ut av admin" |
| `meeting_reminder` | 1h before meeting | Meeting title, date, time, company |
| `callback_reminder` | 15min before callback_at | Company name, phone, callback time |

Templates: EEx files in `lib/saleflow/notifications/templates/`. Clean HTML with inline CSS. SaleFlow logo + accent color header.

### Resend Client

`Saleflow.Notifications.Mailer` — sends via Resend API:
- `POST https://api.resend.com/emails`
- `Authorization: Bearer RESEND_API_KEY`
- From: `noreply@saleflow.se` (configurable)
- Returns `{:ok, id}` or `{:error, reason}`

Config: `RESEND_API_KEY` env var.

---

## Domain: Auth (extends Accounts)

### OtpCode (resource)

Table: `otp_codes`

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → User |
| code | string | 6 digits, e.g. "482917" |
| expires_at | utc_datetime_usec | created_at + 5 min |
| used_at | utc_datetime_usec | nullable, set when verified |
| inserted_at | utc_datetime_usec | |

Actions:
- `create` — generates random 6-digit code, sets expires_at = now + 5 min, sends email via Mailer
- `verify` — checks code matches, not expired, not used. Marks as used.

Constraint: Only one active (unused + unexpired) OTP per user at a time. Creating a new one invalidates old ones.

### Modified Login Flow

1. `POST /api/auth/sign-in` — validates email + password → returns `{otp_sent: true, user_id: uuid}` (NO session yet)
2. `POST /api/auth/verify-otp` — validates user_id + code → creates session + LoginSession → returns `{user: ...}`

If OTP is wrong or expired → 401.
Rate limit: max 5 OTP attempts per user per 15 min.

### LoginSession (resource)

Table: `login_sessions`

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → User |
| session_token | string | unique, used to identify session |
| ip_address | string | from conn.remote_ip |
| user_agent | string | raw user agent string |
| device_type | string | "desktop" / "mobile" / "tablet" |
| browser | string | "Chrome 120" / "Safari 17" / "Firefox 121" |
| city | string | nullable, from GeoIP |
| country | string | nullable, from GeoIP |
| logged_in_at | utc_datetime_usec | |
| last_active_at | utc_datetime_usec | updated on each request |
| logged_out_at | utc_datetime_usec | nullable, set on logout/force-logout |
| force_logged_out | boolean | default false |

Actions:
- `create` — on successful OTP verification, parses UA + does GeoIP lookup
- `touch` — updates last_active_at (called by auth plug on each request)
- `logout` — sets logged_out_at
- `force_logout` — sets logged_out_at + force_logged_out=true, sends email
- `list_active_for_user` — sessions where logged_out_at IS NULL
- `list_all_for_user` — all sessions for a user, sorted desc

### Auth Plug Changes

`RequireAuth` plug now:
1. Gets session_token from cookie
2. Finds LoginSession by token
3. Checks logged_out_at IS NULL (not force-logged-out)
4. Updates last_active_at
5. Loads user
6. If session is force-logged-out → 401 + clear cookie

### GeoIP Lookup

`Saleflow.Auth.GeoIP` module:
- `lookup(ip_address)` → `{:ok, %{city: "Stockholm", country: "Sweden"}}` or `{:error, reason}`
- Uses ip-api.com free API: `GET http://ip-api.com/json/{ip}`
- Rate limit: 45 req/min (free tier) — cache results for 1 hour
- Falls back to `{city: nil, country: nil}` on error

### User Agent Parsing

`Saleflow.Auth.UserAgentParser` module:
- `parse(ua_string)` → `%{device_type: "desktop", browser: "Chrome 120"}`
- Uses `ua_parser` hex package

---

## Workers (Oban)

### MeetingReminderWorker
- Cron: `*/5 * * * *`
- Finds meetings where: status = :scheduled, meeting_date = today, meeting_time between now and now+65min, NOT already reminded
- Sends meeting_reminder email to the agent
- Marks meeting as reminded (add `reminded_at` field to Meeting)

### CallbackReminderWorker
- Cron: `*/5 * * * *`
- Finds leads where: status = :callback, callback_at between now and now+20min, NOT already reminded
- Sends callback_reminder email to the assigned agent
- Marks lead as reminded (add `callback_reminded_at` field to Lead)

---

## API Endpoints (new/modified)

### Modified
- `POST /api/auth/sign-in` — now returns `{otp_sent: true, user_id: uuid}` instead of session
- Auth plug validates LoginSession token instead of raw user_id

### New
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/verify-otp | none | Verify OTP code, create session |
| GET | /api/auth/sessions | auth | List my active sessions |
| POST | /api/auth/sessions/logout-all | auth | Logout all my sessions |
| GET | /api/admin/users/:id/sessions | admin | List all sessions for a user |
| POST | /api/admin/users/:id/force-logout | admin | Force-logout all sessions |
| POST | /api/admin/sessions/:id/force-logout | admin | Force-logout specific session |

---

## Frontend Changes

### Login Page (modified)
Two-step flow:
1. Email + password form (existing)
2. OTP input (6-digit code) — new step after successful email/pass
- "Kod skickad till din e-post" message
- 6 individual digit inputs (auto-focus next on input)
- "Skicka ny kod" link (resend OTP)
- Auto-submit when 6 digits entered

### Admin Users Page (modified)
Add per-user session list:
- Expandable row showing active sessions
- Each session: device icon, browser, city/country, last active (relative time), "Logga ut" button
- "Logga ut alla" button per user

### New: Profile Page (/profile)
- My info (name, email, role)
- My active sessions list (same format as admin but for self)
- "Logga ut överallt" button

---

## Testing

### Backend
- OTP: create, verify, expired, wrong code, rate limit, reuse prevention
- LoginSession: create with parsed UA + GeoIP, touch, logout, force-logout
- Auth plug: validates session token, rejects force-logged-out, updates last_active
- Mailer: each template renders, Resend API called (mock HTTP)
- Workers: meeting reminder sent at correct time, callback reminder, duplicate prevention
- 100% coverage

### Frontend
- Login: two-step OTP flow, resend code, error states
- Admin: session list, force-logout button
- Profile: session list, logout-all
- 100% coverage

### E2E
- Full 2FA login flow
- Admin force-logouts user → user gets 401 on next request
