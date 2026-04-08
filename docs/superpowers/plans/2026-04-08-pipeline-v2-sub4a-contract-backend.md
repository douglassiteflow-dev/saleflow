# Pipeline v2 Sub-plan 4a: Avtalssystem — Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Pageflow's contract system to Saleflow: Contract + ContractTemplate resources, public signing endpoints, WebSocket tracking, PDF generation, email notifications, and Deal auto-advance to `won` on signing.

**Architecture:** Port from `/tmp/pageflow/` (already cloned). Adapt to Saleflow conventions: Contract belongs to Deal (not Organization), uses Saleflow's Ash patterns, Audit logging, and PubSub. Skip BankID, DiscountCode, invoicing, commissions, and reseller support (out of scope).

**Tech Stack:** Elixir/Ash/AshPostgres, Phoenix Channels (WebSocket), ChromicPDF (PDF generation), Oban (background jobs), Resend (email)

**Reference code:** `/tmp/pageflow/backend/lib/pageflow/contracts/` — read for implementation details.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/priv/repo/migrations/20260408160000_create_contracts.exs` | Migration |
| Create | `backend/lib/saleflow/contracts/contract.ex` | Contract Ash resource |
| Create | `backend/lib/saleflow/contracts/contract_template.ex` | ContractTemplate Ash resource |
| Create | `backend/lib/saleflow/contracts/contracts.ex` | Contracts Ash domain |
| Create | `backend/lib/saleflow/contracts/pdf_generator.ex` | HTML→PDF via ChromicPDF |
| Create | `backend/lib/saleflow_web/controllers/contract_public_controller.ex` | Public signing endpoints |
| Create | `backend/lib/saleflow_web/channels/contract_channel.ex` | WebSocket tracking |
| Modify | `backend/lib/saleflow_web/controllers/deal_controller.ex` | send-contract endpoint |
| Modify | `backend/lib/saleflow_web/router.ex` | Contract routes |
| Modify | `backend/lib/saleflow_web/channels/user_socket.ex` | Register contract channel |
| Create | `backend/lib/saleflow/workers/contract_reminder_worker.ex` | Oban: remind unsigned contracts |

---

### Task 1: Migration + Contract resources

**Files:**
- Create: migration, contract.ex, contract_template.ex, contracts.ex

- [ ] **Step 1: Read Pageflow reference**

Read these for implementation patterns:
- `/tmp/pageflow/backend/lib/pageflow/contracts/contract.ex`
- `/tmp/pageflow/backend/lib/pageflow/contracts/contract_template.ex`
- `/tmp/pageflow/backend/lib/pageflow/contracts/contracts.ex`
- `/tmp/pageflow/backend/priv/repo/migrations/20260315102627_create_contracts.exs`

- [ ] **Step 2: Create migration**

Create `backend/priv/repo/migrations/20260408160000_create_contracts.exs`:

```elixir
defmodule Saleflow.Repo.Migrations.CreateContracts do
  use Ecto.Migration

  def change do
    create table(:contract_templates, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :name, :string, null: false
      add :header_html, :text
      add :footer_html, :text
      add :terms_html, :text
      add :logo_url, :string
      add :primary_color, :string, default: "#0f172a"
      add :font, :string, default: "Inter"
      add :is_default, :boolean, default: false, null: false
      add :user_id, references(:users, type: :uuid, on_delete: :nilify_all)

      timestamps()
    end

    create table(:contracts, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :deal_id, references(:deals, type: :uuid, on_delete: :nilify_all)
      add :user_id, references(:users, type: :uuid, on_delete: :nilify_all), null: false
      add :contract_number, :string, null: false
      add :status, :string, default: "draft", null: false
      add :access_token, :string, null: false
      add :verification_code, :string, null: false
      add :recipient_email, :string, null: false
      add :recipient_name, :string, null: false
      add :amount, :integer, null: false
      add :currency, :string, default: "SEK"
      add :terms, :text
      add :customer_signature_url, :text
      add :customer_name, :string
      add :customer_signed_at, :utc_datetime_usec
      add :seller_name, :string, null: false
      add :seller_signed_at, :utc_datetime_usec
      add :pdf_url, :string
      add :signed_pdf_url, :string
      add :last_viewed_page, :string
      add :total_view_time, :integer, default: 0
      add :page_views, :map, default: %{}
      add :expires_at, :utc_datetime_usec
      add :version, :integer, default: 1
      add :auto_renew, :boolean, default: false
      add :renewal_status, :string, default: "active"
      add :renewal_date, :date
      add :cancelled_at, :utc_datetime_usec
      add :cancellation_end_date, :date
      add :custom_fields, :map, default: %{}

      timestamps()
    end

    create unique_index(:contracts, [:access_token])
    create index(:contracts, [:deal_id])
    create index(:contracts, [:user_id])
    create index(:contracts, [:status])
  end
end
```

- [ ] **Step 3: Create Contracts domain**

Create `backend/lib/saleflow/contracts/contracts.ex`:

```elixir
defmodule Saleflow.Contracts do
  use Ash.Domain

  resources do
    resource Saleflow.Contracts.Contract
    resource Saleflow.Contracts.ContractTemplate
  end
end
```

Register domain in `backend/lib/saleflow/application.ex` — add `Saleflow.Contracts` to the `ash_domains` list (read the file to find where domains are registered).

- [ ] **Step 4: Create Contract resource**

Create `backend/lib/saleflow/contracts/contract.ex`. Port from Pageflow but simplify:

Key differences from Pageflow:
- Domain: `Saleflow.Contracts` (not Pageflow.Contracts)
- No `plan`, `monthly_price`, `binding_months`, `free_months`, `deal_value` — use `amount` (integer, cents) + `terms` (text)
- No `organization_id` — use `deal_id` instead
- No `meeting_id` (meetings are on Deal)
- No BankID fields
- No discount fields
- No reseller fields
- Contract number format: "SF-YYYY-NNNN"
- On `:sign` action: find linked Deal and advance to `:won`

Actions needed:
- `:create` — generate contract_number, access_token, verification_code, set seller_signed_at
- `:read` (defaults)
- `:read_by_token` — filter by access_token
- `:mark_sent` — draft → sent
- `:mark_viewed` — draft/sent → viewed
- `:update_tracking` — accept last_viewed_page, total_view_time, page_views
- `:sign` — accept customer_signature_url, customer_name, customer_email → set signed + advance Deal
- `:cancel_contract` — set cancelled_at, cancellation_end_date (90 days)
- `:toggle_auto_renew` — toggle auto_renew boolean
- `:supersede` — set status to :superseded (for renegotiation)

Use `{Saleflow.Audit.Changes.CreateAuditLog, action: "contract.xxx"}` for audit logging on key actions.

- [ ] **Step 5: Create ContractTemplate resource**

Create `backend/lib/saleflow/contracts/contract_template.ex` — simple CRUD resource with fields: name, header_html, footer_html, terms_html, logo_url, primary_color, font, is_default, user_id.

- [ ] **Step 6: Add domain helper functions**

In `contracts.ex`, add functions like:
- `create_contract(params)`, `get_contract(id)`, `get_contract_by_token(token)`
- `mark_sent(contract)`, `mark_viewed(contract)`, `sign_contract(contract, params)`
- `update_tracking(contract, params)`, `cancel_contract(contract)`
- `list_contracts_for_deal(deal_id)`, `list_contracts_for_user(user_id)`

- [ ] **Step 7: Run migration and verify**

```bash
cd /Users/douglassiteflow/dev/saleflow/backend && mix ecto.migrate && mix compile
```

- [ ] **Step 8: Commit**

```bash
git add backend/priv/repo/migrations/20260408160000_create_contracts.exs backend/lib/saleflow/contracts/
git commit -m "feat(pipeline-v2): add Contract and ContractTemplate resources"
```

---

### Task 2: Public contract controller + routes

**Files:**
- Create: `backend/lib/saleflow_web/controllers/contract_public_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`

- [ ] **Step 1: Read Pageflow reference**

Read `/tmp/pageflow/backend/lib/pageflow_web/controllers/contract_public_controller.ex` for implementation patterns.

- [ ] **Step 2: Create public controller**

Port from Pageflow, adapted for Saleflow:

Endpoints:
- `GET /api/contracts/:token` — fetch contract (check expiry)
- `POST /api/contracts/:token/verify` — verify 6-digit code, mark as viewed
- `POST /api/contracts/:token/sign` — canvas signature, advance Deal to won
- `GET /api/contracts/:token/pdf` — download PDF
- `PATCH /api/contracts/:token` — update tracking data

Key differences from Pageflow:
- No organization lookup — use deal_id for context
- On sign: find Deal via contract.deal_id, advance to `:won`
- No invoice generation, no commission
- Broadcast to WebSocket channel on signing

- [ ] **Step 3: Add routes**

```elixir
  # Public contract endpoints (no auth required)
  scope "/api/contracts", SaleflowWeb do
    pipe_through :api

    get "/:token", ContractPublicController, :show
    post "/:token/verify", ContractPublicController, :verify
    post "/:token/sign", ContractPublicController, :sign
    get "/:token/pdf", ContractPublicController, :pdf
    patch "/:token", ContractPublicController, :track
  end
```

Add to authenticated scope:
```elixir
    # Contracts
    post "/contracts", ContractController, :create
    post "/contracts/:id/send-email", ContractController, :send_email
    post "/contracts/:id/cancel-contract", ContractController, :cancel
    post "/deals/:id/send-contract", DealController, :send_contract
```

- [ ] **Step 4: Verify and commit**

---

### Task 3: WebSocket contract channel

**Files:**
- Create: `backend/lib/saleflow_web/channels/contract_channel.ex`
- Modify: `backend/lib/saleflow_web/channels/user_socket.ex`

- [ ] **Step 1: Read Pageflow reference**

Read `/tmp/pageflow/backend/lib/pageflow_web/channels/contract_channel.ex`.

- [ ] **Step 2: Port channel**

Port the contract channel to Saleflow:
- Channel topic: `"contract:{token}"`
- Events: `page_view`, `heartbeat`
- DB flush every 5 seconds (debounce pattern)
- Broadcast tracking updates to admins in real-time
- On join: load existing tracking from contract

Note: This channel is PUBLIC (no auth check) — the token IS the auth.

- [ ] **Step 3: Register channel in user_socket.ex**

Add: `channel "contract:*", SaleflowWeb.ContractChannel`

- [ ] **Step 4: Verify and commit**

---

### Task 4: Send-contract endpoint + email

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/deal_controller.ex`

- [ ] **Step 1: Add send_contract action**

Similar to send_questionnaire, but creates a Contract:
1. Get deal, check ownership, get lead
2. Accept params: amount, terms, recipient_email (default lead.epost), recipient_name (default lead.företag)
3. Create Contract with auto-generated token, verification code, contract number
4. Send email to recipient with link: `siteflow.se/contract/{access_token}` + verification code
5. Advance deal to `contract_sent`
6. Return contract data

- [ ] **Step 2: Verify and commit**

---

### Task 5: PDF generation

**Files:**
- Create: `backend/lib/saleflow/contracts/pdf_generator.ex`

- [ ] **Step 1: Read Pageflow reference**

Read `/tmp/pageflow/backend/lib/pageflow/contracts/pdf_generator.ex`.

- [ ] **Step 2: Check ChromicPDF dependency**

Read `backend/mix.exs` — if ChromicPDF is not in deps, add it:
```elixir
{:chromic_pdf, "~> 1.17"}
```
Run `mix deps.get`.

- [ ] **Step 3: Create PDF generator**

Port from Pageflow, simplified for Saleflow:
- 5 pages: Försättsblad, Tjänstbeskrivning (simplified), Prisöversikt, Villkor, Signering
- Use Siteflow branding (not Pageflow)
- Contract number format: SF-YYYY-NNNN
- Amount displayed in SEK
- Template customization: logo, color, font, terms

Main functions:
- `generate(contract, lead, template \\ nil)` → `{:ok, pdf_binary}`
- `generate_signed(contract, lead, template \\ nil)` → `{:ok, pdf_binary}`

- [ ] **Step 4: Verify and commit**

---

### Task 6: Contract reminder worker (Oban)

**Files:**
- Create: `backend/lib/saleflow/workers/contract_reminder_worker.ex`

- [ ] **Step 1: Create reminder worker**

Oban worker that runs daily at 09:00:
- Find contracts with status `:sent` or `:draft` that are older than 3 days
- Send reminder email to recipient
- Log activity

Register in Oban crontab in `config/config.exs`.

- [ ] **Step 2: Verify and commit**

---

### Task 7: Backend tests

**Files:**
- Create: `backend/test/saleflow/contracts/contract_test.exs`
- Create: `backend/test/saleflow_web/controllers/contract_public_controller_test.exs`

- [ ] **Step 1: Write Contract resource tests**

Test cases:
- Create contract with valid params (auto-generates number, token, verification code)
- Default status is :draft
- mark_sent changes to :sent
- mark_viewed changes to :viewed (from draft or sent)
- sign sets :signed, customer_signed_at, advances linked Deal to :won
- cancel sets cancelled_at, cancellation_end_date
- update_tracking saves page tracking data

- [ ] **Step 2: Write public controller tests**

Test cases:
- GET /:token returns contract data
- GET /:token returns 404 for invalid token
- POST /:token/verify with correct code returns full data
- POST /:token/verify with wrong code returns 401
- POST /:token/sign creates signature and advances deal
- PATCH /:token updates tracking

- [ ] **Step 3: Run all tests**

```bash
cd /Users/douglassiteflow/dev/saleflow/backend && mix test --trace
```

- [ ] **Step 4: Commit**

---

### Task 8: Final validation

- [ ] **Step 1: Full backend test suite**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix test`

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix compile`
