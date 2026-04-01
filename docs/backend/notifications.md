# Notifications — Email via Resend

SaleFlow sends transactional emails through the [Resend](https://resend.com) API.
All email logic lives in the `Saleflow.Notifications` domain under
`lib/saleflow/notifications/`.

---

## Modules

| Module | Purpose |
|---|---|
| `Saleflow.Notifications` | Ash domain shell (no resources yet) |
| `Saleflow.Notifications.Mailer` | Low-level send functions (sync + async) |
| `Saleflow.Notifications.Templates` | Renders `{subject, html}` pairs from EEx templates |

---

## Email Templates

Templates are EEx files stored in `priv/templates/email/`.
Each inner template is rendered and then wrapped by the shared `layout.html.eex`.

| Function | Template file | Subject |
|---|---|---|
| `render_otp_code(code)` | `otp_code.html.eex` | `Din inloggningskod - SaleFlow` |
| `render_welcome(name, login_url)` | `welcome.html.eex` | `Välkommen till SaleFlow!` |
| `render_force_logout(name)` | `force_logout.html.eex` | `Din session har avslutats - SaleFlow` |
| `render_meeting_reminder(title, date, time, company)` | `meeting_reminder.html.eex` | `Påminnelse: möte med <company>` |
| `render_callback_reminder(company, phone, callback_time)` | `callback_reminder.html.eex` | `Påminnelse: återuppringning till <company>` |

All templates use **inline CSS only** (email clients do not load external stylesheets).
The design follows the SaleFlow color palette: indigo `#4F46E5`, white card on
`slate-50` (`#f8fafc`) background, Inter font stack.

### Adding a new template

1. Create `priv/templates/email/<name>.html.eex` with the inner content.
2. Add a public function to `Saleflow.Notifications.Templates` that calls
   `render("<name>.html.eex", assigns)` and returns `{subject, html}`.
3. Add tests to `test/saleflow/notifications/templates_test.exs`.

---

## Mailer Usage

### Async (recommended)

Use `send_email_async/3` for fire-and-forget notifications where a delivery
failure must not block the caller. The call returns `:ok` immediately and any
error is logged as a `Logger.warning`.

```elixir
{subject, html} = Saleflow.Notifications.Templates.render_otp_code("123456")

Saleflow.Notifications.Mailer.send_email_async(
  user.email,
  subject,
  html
)
```

### Sync (when delivery confirmation is required)

```elixir
{subject, html} = Saleflow.Notifications.Templates.render_welcome(user.name, login_url)

case Saleflow.Notifications.Mailer.send_email(user.email, subject, html) do
  {:ok, resend_id} -> Logger.info("Email sent: #{resend_id}")
  {:error, reason} -> Logger.error("Email failed: #{inspect(reason)}")
end
```

### Sync vs Async policy

| Scenario | Function | Reason |
|---|---|---|
| OTP code | `send_email_async` | Non-blocking; retry is handled by the user re-requesting a code |
| Welcome | `send_email_async` | Informational; failure must not break registration |
| Force-logout | `send_email_async` | Administrative; low urgency |
| Meeting reminder | `send_email_async` | Background worker fires it; failure is acceptable |
| Callback reminder | `send_email_async` | Same as meeting |
| Critical delivery confirmation (future) | `send_email` | When you explicitly need a Resend ID |

---

## Resend Configuration

### Environment variables

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key (starts with `re_`) |

### Runtime config

```elixir
# config/config.exs
config :saleflow, :resend_api_key, System.get_env("RESEND_API_KEY")
config :saleflow, :resend_from,    "SaleFlow <noreply@saleflow.se>"
config :saleflow, :mailer_sandbox, false
```

### Sandbox mode (tests)

When `:mailer_sandbox` is `true`, no HTTP request is made. The email is logged
at the `:warning` level and `{:ok, "sandbox"}` is returned. This is
automatically set in `config/test.exs`:

```elixir
config :saleflow, :resend_api_key, "re_test_sandbox"
config :saleflow, :mailer_sandbox, true
```

### Production setup

1. Create a Resend account and add the `saleflow.se` domain.
2. Set `RESEND_API_KEY=re_live_...` in the production environment.
3. The `:resend_from` address must be from a verified domain.

---

## Tests

```
test/saleflow/notifications/templates_test.exs   # 30 tests — render functions
test/saleflow/notifications/mailer_test.exs      # 5 tests — send_email/async
```

Run:

```bash
cd backend
mix test test/saleflow/notifications/
```
