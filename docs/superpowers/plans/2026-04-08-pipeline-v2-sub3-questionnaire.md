# Pipeline v2 Sub-plan 3: Kundformulär

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a customer-facing questionnaire wizard that collects material for the finished website (capacity, colors, services, media, add-on services), accessible via a public token URL without login.

**Architecture:** New Questionnaire + QuestionnaireTemplate Ash resources. Public Phoenix controller for questionnaire access/submission. File uploads to Cloudflare R2 via existing `Saleflow.Storage`. Email via `Saleflow.Notifications.Mailer`. New React page at `/q/:token` rendered outside the auth wrapper. Agent sends questionnaire from deal detail page → creates Questionnaire + sends email → Deal advances to `questionnaire_sent`.

**Tech Stack:** Elixir/Ash/AshPostgres (backend), React/TypeScript/Tailwind (frontend), Cloudflare R2 (file storage), Resend (email)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/priv/repo/migrations/20260408140000_create_questionnaires.exs` | Migration for questionnaires + questionnaire_templates tables |
| Create | `backend/lib/saleflow/sales/questionnaire.ex` | Questionnaire Ash resource |
| Create | `backend/lib/saleflow/sales/questionnaire_template.ex` | QuestionnaireTemplate Ash resource |
| Modify | `backend/lib/saleflow/sales/sales.ex` | Register resources + domain functions |
| Create | `backend/lib/saleflow_web/controllers/questionnaire_public_controller.ex` | Public endpoints: GET/PATCH/POST/upload |
| Modify | `backend/lib/saleflow_web/controllers/deal_controller.ex` | Add send-questionnaire endpoint |
| Modify | `backend/lib/saleflow_web/router.ex` | Add public + auth routes |
| Create | `frontend/src/pages/questionnaire.tsx` | Public 7-step wizard page |
| Create | `frontend/src/api/questionnaire.ts` | API client for public questionnaire |
| Modify | `frontend/src/pages/pipeline-detail.tsx` | "Skicka formulär" button at questionnaire_sent stage |
| Modify | `frontend/src/components/dialer/deal-detail-tab.tsx` | "Skicka formulär" button in dialer |

---

### Task 1: Migration — questionnaires + questionnaire_templates

**Files:**
- Create: `backend/priv/repo/migrations/20260408140000_create_questionnaires.exs`

- [ ] **Step 1: Create migration**

```elixir
defmodule Saleflow.Repo.Migrations.CreateQuestionnaires do
  use Ecto.Migration

  def change do
    create table(:questionnaire_templates, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :name, :string, null: false
      add :questions, :map, default: %{}
      add :is_default, :boolean, default: false, null: false

      timestamps()
    end

    create table(:questionnaires, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :deal_id, references(:deals, type: :uuid, on_delete: :nilify_all)
      add :token, :string, null: false
      add :status, :string, default: "pending", null: false
      add :customer_email, :string, null: false
      add :capacity, :string
      add :color_theme, :string
      add :services_text, :text
      add :services_file_url, :string
      add :custom_changes, :text
      add :wants_ads, :boolean
      add :most_profitable_service, :string
      add :wants_quote_generator, :boolean
      add :addon_services, {:array, :string}, default: []
      add :media_urls, {:array, :string}, default: []
      add :completed_at, :utc_datetime_usec

      timestamps()
    end

    create unique_index(:questionnaires, [:token])
    create index(:questionnaires, [:deal_id])
    create unique_index(:questionnaires, [:deal_id])
  end
end
```

- [ ] **Step 2: Run migration**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix ecto.migrate`

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow && git add backend/priv/repo/migrations/20260408140000_create_questionnaires.exs
git commit -m "feat(pipeline-v2): add migration for questionnaires and templates"
```

---

### Task 2: Questionnaire + QuestionnaireTemplate Ash resources

**Files:**
- Create: `backend/lib/saleflow/sales/questionnaire.ex`
- Create: `backend/lib/saleflow/sales/questionnaire_template.ex`
- Modify: `backend/lib/saleflow/sales/sales.ex`

- [ ] **Step 1: Create QuestionnaireTemplate resource**

```elixir
defmodule Saleflow.Sales.QuestionnaireTemplate do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "questionnaire_templates"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :questions, :map do
      default %{}
      allow_nil? false
      public? true
    end

    attribute :is_default, :boolean do
      default false
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [:name, :questions, :is_default]
    end

    update :update do
      accept [:name, :questions, :is_default]
    end
  end
end
```

- [ ] **Step 2: Create Questionnaire resource**

```elixir
defmodule Saleflow.Sales.Questionnaire do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "questionnaires"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :deal_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :token, :string do
      allow_nil? false
      public? true
    end

    attribute :status, :atom do
      constraints one_of: [:pending, :in_progress, :completed]
      default :pending
      allow_nil? false
      public? true
    end

    attribute :customer_email, :string do
      allow_nil? false
      public? true
    end

    attribute :capacity, :string do
      allow_nil? true
      public? true
    end

    attribute :color_theme, :string do
      allow_nil? true
      public? true
    end

    attribute :services_text, :string do
      allow_nil? true
      public? true
    end

    attribute :services_file_url, :string do
      allow_nil? true
      public? true
    end

    attribute :custom_changes, :string do
      allow_nil? true
      public? true
    end

    attribute :wants_ads, :boolean do
      allow_nil? true
      public? true
    end

    attribute :most_profitable_service, :string do
      allow_nil? true
      public? true
    end

    attribute :wants_quote_generator, :boolean do
      allow_nil? true
      public? true
    end

    attribute :addon_services, {:array, :string} do
      default []
      allow_nil? false
      public? true
    end

    attribute :media_urls, {:array, :string} do
      default []
      allow_nil? false
      public? true
    end

    attribute :completed_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a questionnaire for a deal"
      accept [:deal_id, :customer_email, :token]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "questionnaire.created"}
    end

    update :save_answers do
      description "Autosave questionnaire answers (partial or complete)"
      require_atomic? false
      accept [
        :capacity, :color_theme, :services_text, :services_file_url,
        :custom_changes, :wants_ads, :most_profitable_service,
        :wants_quote_generator, :addon_services, :media_urls
      ]

      change fn changeset, _context ->
        current = Ash.Changeset.get_attribute(changeset, :status)
        if current == :pending do
          Ash.Changeset.force_change_attribute(changeset, :status, :in_progress)
        else
          changeset
        end
      end
    end

    update :complete do
      description "Mark questionnaire as completed"
      require_atomic? false

      change fn changeset, _context ->
        changeset
        |> Ash.Changeset.force_change_attribute(:status, :completed)
        |> Ash.Changeset.force_change_attribute(:completed_at, DateTime.utc_now())
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "questionnaire.completed"}
    end
  end
end
```

- [ ] **Step 3: Register resources in Sales domain**

Add to `backend/lib/saleflow/sales/sales.ex` in the `resources do` block:

```elixir
resource Saleflow.Sales.Questionnaire
resource Saleflow.Sales.QuestionnaireTemplate
```

- [ ] **Step 4: Add domain functions to sales.ex**

Add after the Deal functions section:

```elixir
  # ---------------------------------------------------------------------------
  # Questionnaire functions
  # ---------------------------------------------------------------------------

  def create_questionnaire(params) do
    Saleflow.Sales.Questionnaire
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def get_questionnaire(id) do
    Saleflow.Sales.Questionnaire
    |> Ash.get(id)
  end

  def get_questionnaire_by_token(token) do
    require Ash.Query

    Saleflow.Sales.Questionnaire
    |> Ash.Query.filter(token == ^token)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [q | _]} -> {:ok, q}
      {:ok, []} -> {:error, :not_found}
      error -> error
    end
  end

  def save_questionnaire_answers(questionnaire, params) do
    questionnaire
    |> Ash.Changeset.for_update(:save_answers, params)
    |> Ash.update()
  end

  def complete_questionnaire(questionnaire) do
    questionnaire
    |> Ash.Changeset.for_update(:complete, %{})
    |> Ash.update()
  end

  def get_questionnaire_for_deal(deal_id) do
    require Ash.Query

    Saleflow.Sales.Questionnaire
    |> Ash.Query.filter(deal_id == ^deal_id)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [q | _]} -> {:ok, q}
      {:ok, []} -> {:ok, nil}
      error -> error
    end
  end
```

- [ ] **Step 5: Verify compilation**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix compile`

- [ ] **Step 6: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow && git add backend/lib/saleflow/sales/questionnaire.ex backend/lib/saleflow/sales/questionnaire_template.ex backend/lib/saleflow/sales/sales.ex
git commit -m "feat(pipeline-v2): add Questionnaire and QuestionnaireTemplate resources"
```

---

### Task 3: Backend — Public questionnaire controller + routes

**Files:**
- Create: `backend/lib/saleflow_web/controllers/questionnaire_public_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`

- [ ] **Step 1: Create public controller**

```elixir
defmodule SaleflowWeb.QuestionnairePublicController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  @doc "GET /q/:token — fetch questionnaire data and questions"
  def show(conn, %{"token" => token}) do
    case Sales.get_questionnaire_by_token(token) do
      {:ok, q} ->
        json(conn, %{questionnaire: serialize(q)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Formuläret hittades inte"})
    end
  end

  @doc "PATCH /q/:token — autosave answers"
  def save(conn, %{"token" => token} = params) do
    with {:ok, q} <- Sales.get_questionnaire_by_token(token),
         {:ok, updated} <- Sales.save_questionnaire_answers(q, parse_answers(params)) do
      json(conn, %{questionnaire: serialize(updated)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Formuläret hittades inte"})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Kunde inte spara"})
    end
  end

  @doc "POST /q/:token/complete — mark as completed, notify deal owner"
  def complete(conn, %{"token" => token}) do
    with {:ok, q} <- Sales.get_questionnaire_by_token(token),
         {:ok, completed} <- Sales.complete_questionnaire(q) do
      # Notify deal owner
      maybe_notify_deal_owner(completed)
      json(conn, %{questionnaire: serialize(completed)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Formuläret hittades inte"})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Kunde inte slutföra"})
    end
  end

  @doc "POST /q/:token/upload — upload media file, return URL"
  def upload(conn, %{"token" => token, "file" => %Plug.Upload{} = upload}) do
    with {:ok, q} <- Sales.get_questionnaire_by_token(token) do
      key = "questionnaires/#{q.id}/#{Ecto.UUID.generate()}-#{upload.filename}"
      data = File.read!(upload.path)

      case Saleflow.Storage.upload(key, data, upload.content_type) do
        {:ok, _} ->
          {:ok, url} = Saleflow.Storage.presigned_url(key)
          # Append to media_urls
          new_urls = (q.media_urls || []) ++ [url]
          {:ok, _} = Sales.save_questionnaire_answers(q, %{media_urls: new_urls})
          json(conn, %{url: url})

        {:error, reason} ->
          conn |> put_status(500) |> json(%{error: "Uppladdning misslyckades: #{inspect(reason)}"})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Formuläret hittades inte"})
    end
  end

  def upload(conn, %{"token" => _token}) do
    conn |> put_status(:bad_request) |> json(%{error: "Ingen fil bifogad"})
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp serialize(q) do
    %{
      id: q.id,
      deal_id: q.deal_id,
      token: q.token,
      status: q.status,
      customer_email: q.customer_email,
      capacity: q.capacity,
      color_theme: q.color_theme,
      services_text: q.services_text,
      services_file_url: q.services_file_url,
      custom_changes: q.custom_changes,
      wants_ads: q.wants_ads,
      most_profitable_service: q.most_profitable_service,
      wants_quote_generator: q.wants_quote_generator,
      addon_services: q.addon_services,
      media_urls: q.media_urls,
      completed_at: q.completed_at,
      inserted_at: q.inserted_at,
      updated_at: q.updated_at
    }
  end

  defp parse_answers(params) do
    %{}
    |> maybe_put(:capacity, params["capacity"])
    |> maybe_put(:color_theme, params["color_theme"])
    |> maybe_put(:services_text, params["services_text"])
    |> maybe_put(:services_file_url, params["services_file_url"])
    |> maybe_put(:custom_changes, params["custom_changes"])
    |> maybe_put(:wants_ads, params["wants_ads"])
    |> maybe_put(:most_profitable_service, params["most_profitable_service"])
    |> maybe_put(:wants_quote_generator, params["wants_quote_generator"])
    |> maybe_put(:addon_services, params["addon_services"])
    |> maybe_put(:media_urls, params["media_urls"])
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp maybe_notify_deal_owner(questionnaire) do
    if questionnaire.deal_id do
      case Sales.get_deal(questionnaire.deal_id) do
        {:ok, deal} ->
          Saleflow.Notifications.Notify.send(%{
            user_id: deal.user_id,
            type: "questionnaire_completed",
            title: "Formulär ifyllt",
            body: "Kunden har fyllt i formuläret",
            resource_type: "Deal",
            resource_id: deal.id
          })

        _ -> :ok
      end
    end
  end
end
```

- [ ] **Step 2: Add routes to router.ex**

Add a public scope (no auth) in router.ex, before the authenticated scope:

```elixir
  # Public questionnaire endpoints (no auth required)
  scope "/q", SaleflowWeb do
    pipe_through :api

    get "/:token", QuestionnairePublicController, :show
    patch "/:token", QuestionnairePublicController, :save
    post "/:token/complete", QuestionnairePublicController, :complete
    post "/:token/upload", QuestionnairePublicController, :upload
  end
```

Add to the authenticated scope (inside existing `scope "/api"` with require_auth):

```elixir
    # Questionnaires
    post "/deals/:id/send-questionnaire", DealController, :send_questionnaire
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix compile`

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow && git add backend/lib/saleflow_web/controllers/questionnaire_public_controller.ex backend/lib/saleflow_web/router.ex
git commit -m "feat(pipeline-v2): add public questionnaire controller and routes"
```

---

### Task 4: Backend — Send questionnaire endpoint on DealController

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/deal_controller.ex`

- [ ] **Step 1: Read deal_controller.ex**

- [ ] **Step 2: Add send_questionnaire action**

Add after the `update` action:

```elixir
  @doc """
  Send questionnaire to customer.
  Creates a Questionnaire record, sends email with link, advances deal to questionnaire_sent.
  """
  def send_questionnaire(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, deal} <- get_deal(id),
         :ok <- check_ownership(deal, user),
         {:ok, lead} <- Sales.get_lead(deal.lead_id) do
      email = params["customer_email"] || lead.epost

      unless email do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Ingen email angiven"})
      else
        token = Base.url_encode64(:crypto.strong_rand_bytes(32), padding: false)

        case Sales.create_questionnaire(%{
          deal_id: deal.id,
          customer_email: email,
          token: token
        }) do
          {:ok, questionnaire} ->
            # Send email
            send_questionnaire_email(email, lead.företag, token)

            # Advance deal to questionnaire_sent
            Sales.advance_deal(deal)

            broadcast_dashboard_update("questionnaire_sent")

            json(conn, %{
              questionnaire: %{
                id: questionnaire.id,
                token: questionnaire.token,
                status: questionnaire.status,
                customer_email: questionnaire.customer_email
              }
            })

          {:error, _} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Kunde inte skapa formulär"})
        end
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Deal not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  defp send_questionnaire_email(email, company_name, token) do
    base_url = Application.get_env(:saleflow, :questionnaire_base_url, "https://siteflow.se")
    link = "#{base_url}/q/#{token}"

    html = """
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Hej!</h2>
      <p>Vi förbereder din nya hemsida och behöver lite information från dig.</p>
      <p>Fyll i formuläret via länken nedan — det tar bara några minuter:</p>
      <p style="margin: 24px 0;">
        <a href="#{link}" style="background: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Fyll i formuläret
        </a>
      </p>
      <p style="color: #64748b; font-size: 14px;">
        Du kan spara och fortsätta senare — dina svar sparas automatiskt.
      </p>
      <p style="color: #64748b; font-size: 14px;">Med vänliga hälsningar,<br>Siteflow</p>
    </div>
    """

    Saleflow.Notifications.Mailer.send_email_async(
      email,
      "Fyll i formuläret för din nya hemsida — #{company_name}",
      html
    )
  end
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix compile`

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow && git add backend/lib/saleflow_web/controllers/deal_controller.ex
git commit -m "feat(pipeline-v2): add send-questionnaire endpoint to DealController"
```

---

### Task 5: Backend tests — Questionnaire resource + controller

**Files:**
- Create: `backend/test/saleflow/sales/questionnaire_test.exs`
- Create: `backend/test/saleflow_web/controllers/questionnaire_public_controller_test.exs`

- [ ] **Step 1: Write Questionnaire resource tests**

Test cases:
- Create questionnaire with valid params (deal_id, customer_email, token)
- Default status is :pending
- save_answers updates fields and transitions status to :in_progress
- complete sets status to :completed and completed_at
- get_questionnaire_by_token finds by token
- get_questionnaire_by_token returns error for invalid token

- [ ] **Step 2: Write public controller tests**

Test cases for GET /q/:token:
- Returns questionnaire data for valid token
- Returns 404 for invalid token

Test cases for PATCH /q/:token:
- Saves answers and returns updated data
- Transitions from pending to in_progress on first save
- Returns 404 for invalid token

Test cases for POST /q/:token/complete:
- Marks as completed, sets completed_at
- Returns 404 for invalid token

Test cases for POST /q/:token/upload:
- Returns error when no file attached (skip actual R2 upload in tests)

Note: These tests use public endpoints — no auth needed in test setup.

- [ ] **Step 3: Run tests**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix test test/saleflow/sales/questionnaire_test.exs test/saleflow_web/controllers/questionnaire_public_controller_test.exs --trace`

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow && git add backend/test/saleflow/sales/questionnaire_test.exs backend/test/saleflow_web/controllers/questionnaire_public_controller_test.exs
git commit -m "test(pipeline-v2): add questionnaire resource and controller tests"
```

---

### Task 6: Frontend — Public questionnaire page

**Files:**
- Create: `frontend/src/pages/questionnaire.tsx`
- Create: `frontend/src/api/questionnaire.ts`

- [ ] **Step 1: Create API client**

```typescript
// frontend/src/api/questionnaire.ts
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export interface QuestionnaireData {
  id: string;
  deal_id: string | null;
  token: string;
  status: "pending" | "in_progress" | "completed";
  customer_email: string;
  capacity: string | null;
  color_theme: string | null;
  services_text: string | null;
  services_file_url: string | null;
  custom_changes: string | null;
  wants_ads: boolean | null;
  most_profitable_service: string | null;
  wants_quote_generator: boolean | null;
  addon_services: string[];
  media_urls: string[];
  completed_at: string | null;
}

export async function fetchQuestionnaire(token: string): Promise<QuestionnaireData> {
  const res = await fetch(`${API_BASE}/q/${token}`);
  if (!res.ok) throw new Error("Formuläret hittades inte");
  const data = await res.json();
  return data.questionnaire;
}

export async function saveAnswers(token: string, answers: Partial<QuestionnaireData>): Promise<QuestionnaireData> {
  const res = await fetch(`${API_BASE}/q/${token}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answers),
  });
  if (!res.ok) throw new Error("Kunde inte spara");
  const data = await res.json();
  return data.questionnaire;
}

export async function completeQuestionnaire(token: string): Promise<QuestionnaireData> {
  const res = await fetch(`${API_BASE}/q/${token}/complete`, { method: "POST" });
  if (!res.ok) throw new Error("Kunde inte slutföra");
  const data = await res.json();
  return data.questionnaire;
}

export async function uploadMedia(token: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/q/${token}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Uppladdning misslyckades");
  const data = await res.json();
  return data.url;
}
```

- [ ] **Step 2: Create questionnaire page**

Build a 7-step wizard at `frontend/src/pages/questionnaire.tsx`:
- Extract token from URL params (React Router: `/q/:token`)
- Fetch questionnaire data on mount
- If status == "completed", show thank-you page
- Progress bar at top
- Each step as described in spec:

**Step 1 — Kapacitet:** Radio buttons (1-10, 10-20, 20-30, 30-40, 50-100, Obegränsat) with info text about Google.

**Step 2 — Utseende:** Color picker or text input for theme color. Color palette preview.

**Step 3 — Tjänster:** Three options — upload file (xlsx/pdf), write text, or paste URL.

**Step 4 — Media:** Drag & drop file upload area. Preview uploaded files. Max 50MB per file.

**Step 5 — Tilläggstjänster:** Checkbox cards with icon + title + tooltip for each service:
- Professionell företags-email
- Företagsnummer / Växel
- AI-Receptionist
- Avancerad SEO
- Journalsystem / Journalkoppling
- Schemaläggning & Personal
- Bokningssystem
- Ta betalt online
- Webshop
- Betalda annonser
- Offertgenerering

Each card shows a selling tooltip on hover/click describing the service.

**Step 6 — Övrigt:** Two text fields — "mest lönsamma tjänst" and "ändringsönskemål".

**Step 7 — Klar:** Summary of all answers. "Skicka" button.

**UX details:**
- Autosave: debounced PATCH on every field change (500ms debounce)
- Mobile responsive (flex-col on small screens)
- "Tillbaka" and "Nästa" buttons on each step
- No mandatory fields except capacity (step 1)
- Thank-you page: "Tack! Vi återkommer när din hemsida är redo"
- All text in Swedish (ÅÄÖ)
- Standalone page — no app navigation bar, no sidebar

**Styling:** Match the project's Tailwind design system. Use the same color palette and typography as the dashboard.

- [ ] **Step 3: Add route**

Add to the React Router config (check `frontend/src/App.tsx` or equivalent router file) a public route:
```typescript
<Route path="/q/:token" element={<QuestionnairePage />} />
```
This route must be OUTSIDE the auth wrapper so it's accessible without login.

- [ ] **Step 4: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow && git add frontend/src/pages/questionnaire.tsx frontend/src/api/questionnaire.ts
git commit -m "feat(pipeline-v2): add public questionnaire wizard page"
```

---

### Task 7: Frontend — "Skicka formulär" button in deal detail

**Files:**
- Modify: `frontend/src/pages/pipeline-detail.tsx`
- Modify: `frontend/src/components/dialer/deal-detail-tab.tsx`
- Create: `frontend/src/api/questionnaire-admin.ts`

- [ ] **Step 1: Create admin API hook**

```typescript
// frontend/src/api/questionnaire-admin.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";

interface SendQuestionnaireParams {
  dealId: string;
  customerEmail?: string;
}

interface SendQuestionnaireResult {
  questionnaire: {
    id: string;
    token: string;
    status: string;
    customer_email: string;
  };
}

export function useSendQuestionnaire() {
  const queryClient = useQueryClient();

  return useMutation<SendQuestionnaireResult, ApiError, SendQuestionnaireParams>({
    mutationFn: ({ dealId, customerEmail }) =>
      api<SendQuestionnaireResult>(`/api/deals/${dealId}/send-questionnaire`, {
        method: "POST",
        body: JSON.stringify({ customer_email: customerEmail }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["deals", "detail", variables.dealId] });
    },
  });
}
```

- [ ] **Step 2: Add "Skicka formulär" button to pipeline-detail.tsx**

Read the current file. At the `meeting_completed` stage section, add a "Skicka formulär" button that:
- Opens a small dialog/prompt for customer email (pre-filled from lead.epost)
- Calls `useSendQuestionnaire` mutation
- Shows success toast on completion

- [ ] **Step 3: Add same button to deal-detail-tab.tsx**

Same pattern for the dialer deal detail view.

- [ ] **Step 4: Run tests and TypeScript check**

Run:
- `cd /Users/douglassiteflow/dev/saleflow/frontend && npx tsc --noEmit`
- `cd /Users/douglassiteflow/dev/saleflow/frontend && npx vitest run`

- [ ] **Step 5: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow && git add frontend/src/api/questionnaire-admin.ts frontend/src/pages/pipeline-detail.tsx frontend/src/components/dialer/deal-detail-tab.tsx
git commit -m "feat(pipeline-v2): add send-questionnaire button to deal detail pages"
```

---

### Task 8: Frontend tests — Questionnaire page

**Files:**
- Create: `frontend/src/pages/__tests__/questionnaire.test.tsx`

- [ ] **Step 1: Write tests**

Test cases:
1. Shows loading state while fetching
2. Renders step 1 (capacity) by default
3. Shows all capacity radio options
4. "Nästa" advances to step 2
5. "Tillbaka" returns to previous step
6. Progress bar updates with step
7. Step 5 shows all add-on services with tooltips
8. Step 7 shows summary
9. Shows thank-you page when status is "completed"
10. Renders without navigation bar (standalone page)

Mock the fetch API for questionnaire endpoints.

- [ ] **Step 2: Run tests**

Run: `cd /Users/douglassiteflow/dev/saleflow/frontend && npx vitest run src/pages/__tests__/questionnaire.test.tsx`

- [ ] **Step 3: Commit**

```bash
cd /Users/douglassiteflow/dev/saleflow && git add frontend/src/pages/__tests__/questionnaire.test.tsx
git commit -m "test(pipeline-v2): add questionnaire page tests"
```

---

### Task 9: Final validation

- [ ] **Step 1: Run full backend tests**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix test`
Expected: All pass.

- [ ] **Step 2: Run full frontend tests**

Run: `cd /Users/douglassiteflow/dev/saleflow/frontend && npx vitest run`
Expected: All pass.

- [ ] **Step 3: TypeScript check**

Run: `cd /Users/douglassiteflow/dev/saleflow/frontend && npx tsc --noEmit`
Expected: 0 errors.
