# Dialer Kundmodal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace call-modal with a full customer modal that shows all lead info, editable email/website, call history with recordings, comments, contacts, and outcome buttons — cannot be closed without submitting an outcome.

**Architecture:** New `CustomerModal` component replaces `CallModal` in the dialer. Backend expands Lead `update_fields` to accept epost/hemsida, adds a Contact resource for additional phone numbers/contacts. The modal has two tabs (Kundinfo/Historik) with outcome buttons always visible at the bottom.

**Tech Stack:** Elixir/Phoenix/Ash (backend), React/TypeScript/React Query (frontend), Tailwind CSS with project design tokens

**Spec:** `docs/superpowers/specs/2026-04-07-dialer-customer-modal-design.md`

---

## File Structure

### Backend — New files
| File | Responsibility |
|------|---------------|
| `lib/saleflow/sales/contact.ex` | Ash resource: lead contacts (name, role, phone, email) |
| `priv/repo/migrations/*_create_contacts.exs` | Database migration |
| `test/saleflow/sales/contact_test.exs` | Contact resource tests |

### Backend — Modified files
| File | Change |
|------|--------|
| `lib/saleflow/sales/lead.ex` | Expand `update_fields` to accept epost, hemsida |
| `lib/saleflow/sales.ex` | Register Contact resource, add domain functions |
| `lib/saleflow_web/controllers/lead_controller.ex` | Add contacts endpoints, expand show with contacts + call history |
| `lib/saleflow_web/router.ex` | Add contact routes |

### Frontend — New files
| File | Responsibility |
|------|---------------|
| `src/components/dialer/customer-modal.tsx` | Main modal: header, call bar, tabs, quick links, outcome |
| `src/components/dialer/customer-modal-info.tsx` | Tab 1: kundinfo (left: data+phones+contacts, right: comments) |
| `src/components/dialer/customer-modal-history.tsx` | Tab 2: call history with recordings |
| `src/components/dialer/inline-edit-field.tsx` | Generic click-to-edit field component |
| `src/api/contacts.ts` | React Query hooks for contacts |
| `src/__tests__/components/dialer/customer-modal.test.tsx` | Modal tests |
| `src/__tests__/components/dialer/customer-modal-info.test.tsx` | Info tab tests |
| `src/__tests__/components/dialer/customer-modal-history.test.tsx` | History tab tests |
| `src/__tests__/components/dialer/inline-edit-field.test.tsx` | Inline edit tests |

### Frontend — Modified files
| File | Change |
|------|--------|
| `src/api/leads.ts` | Expand useUpdateLead to accept epost, hemsida |
| `src/api/types.ts` | Add Contact type, update Lead with contacts |
| `src/pages/dialer.tsx` | Replace CallModal with CustomerModal |

---

## Task 1: Contact Migration + Ash Resource

**Files:**
- Create: `backend/priv/repo/migrations/*_create_contacts.exs`
- Create: `backend/lib/saleflow/sales/contact.ex`
- Create: `backend/test/saleflow/sales/contact_test.exs`
- Modify: `backend/lib/saleflow/sales.ex`

- [ ] **Step 1: Write tests**

```elixir
defmodule Saleflow.Sales.ContactTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  defp create_lead! do
    {:ok, lead} =
      Saleflow.Sales.Lead
      |> Ash.Changeset.for_create(:create, %{company_name: "Test AB", phone: "070123"})
      |> Ash.create()
    lead
  end

  describe "create_contact" do
    test "creates contact with all fields" do
      lead = create_lead!()
      assert {:ok, contact} = Sales.create_contact(%{
        lead_id: lead.id,
        name: "Anna Svensson",
        role: "VD",
        phone: "070-987 65 43",
        email: "anna@test.se"
      })
      assert contact.name == "Anna Svensson"
      assert contact.lead_id == lead.id
    end

    test "creates contact with only name" do
      lead = create_lead!()
      assert {:ok, contact} = Sales.create_contact(%{lead_id: lead.id, name: "Erik"})
      assert is_nil(contact.phone)
    end

    test "fails without lead_id" do
      assert {:error, _} = Sales.create_contact(%{name: "Test"})
    end

    test "fails without name" do
      lead = create_lead!()
      assert {:error, _} = Sales.create_contact(%{lead_id: lead.id})
    end
  end

  describe "list_contacts_for_lead" do
    test "returns contacts for lead" do
      lead = create_lead!()
      {:ok, _} = Sales.create_contact(%{lead_id: lead.id, name: "Anna"})
      {:ok, _} = Sales.create_contact(%{lead_id: lead.id, name: "Erik"})
      assert {:ok, contacts} = Sales.list_contacts_for_lead(lead.id)
      assert length(contacts) == 2
    end
  end

  describe "delete_contact" do
    test "deletes a contact" do
      lead = create_lead!()
      {:ok, contact} = Sales.create_contact(%{lead_id: lead.id, name: "Anna"})
      assert :ok = Sales.delete_contact(contact)
      assert {:ok, []} = Sales.list_contacts_for_lead(lead.id)
    end
  end
end
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mix test test/saleflow/sales/contact_test.exs`
Expected: Compilation errors.

- [ ] **Step 3: Create migration**

```elixir
defmodule Saleflow.Repo.Migrations.CreateContacts do
  use Ecto.Migration

  def change do
    create table(:contacts, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :lead_id, references(:leads, type: :uuid, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :role, :string
      add :phone, :string
      add :email, :string
      timestamps(type: :utc_datetime)
    end

    create index(:contacts, [:lead_id])
  end
end
```

- [ ] **Step 4: Create Contact resource**

```elixir
defmodule Saleflow.Sales.Contact do
  use Ash.Resource,
    otp_app: :saleflow,
    domain: Saleflow.Sales,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "contacts"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id
    attribute :name, :string, allow_nil?: false, public?: true
    attribute :role, :string, public?: true
    attribute :phone, :string, public?: true
    attribute :email, :string, public?: true
    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  relationships do
    belongs_to :lead, Saleflow.Sales.Lead, allow_nil?: false
  end

  actions do
    defaults [:read]

    create :create do
      accept [:lead_id, :name, :role, :phone, :email]
    end

    destroy :destroy do
    end
  end
end
```

- [ ] **Step 5: Register resource + add domain functions**

In `backend/lib/saleflow/sales.ex` add to resources block:
```elixir
resource Saleflow.Sales.Contact
```

Add domain functions:
```elixir
def create_contact(params) do
  Saleflow.Sales.Contact
  |> Ash.Changeset.for_create(:create, params)
  |> Ash.create()
end

def list_contacts_for_lead(lead_id) do
  require Ash.Query
  Saleflow.Sales.Contact
  |> Ash.Query.filter(lead_id == ^lead_id)
  |> Ash.Query.sort(inserted_at: :asc)
  |> Ash.read()
end

def delete_contact(contact) do
  contact |> Ash.Changeset.for_destroy(:destroy) |> Ash.destroy()
end
```

- [ ] **Step 6: Run migration and tests**

Run: `cd backend && mix ecto.migrate && mix test test/saleflow/sales/contact_test.exs`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add backend/lib/saleflow/sales/contact.ex backend/lib/saleflow/sales.ex backend/priv/repo/migrations/ backend/test/saleflow/sales/contact_test.exs
git commit -m "feat: add Contact resource for lead contacts"
```

---

## Task 2: Expand Lead update_fields

**Files:**
- Modify: `backend/lib/saleflow/sales/lead.ex`
- Modify: `backend/lib/saleflow_web/controllers/lead_controller.ex`
- Add tests to lead controller tests

- [ ] **Step 1: Write tests**

Add to lead controller tests:
```elixir
test "updates epost via PATCH", %{conn: conn, lead: lead} do
  conn = patch(conn, "/api/leads/#{lead.id}", %{epost: "ny@email.se"})
  assert %{"lead" => %{"epost" => "ny@email.se"}} = json_response(conn, 200)
end

test "updates hemsida via PATCH", %{conn: conn, lead: lead} do
  conn = patch(conn, "/api/leads/#{lead.id}", %{hemsida: "nyhemsida.se"})
  assert %{"lead" => %{"hemsida" => "nyhemsida.se"}} = json_response(conn, 200)
end
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Expand Lead resource**

In `backend/lib/saleflow/sales/lead.ex`, find the `update_fields` action and add `:epost` and `:hemsida` to the accept list:

```elixir
update :update_fields do
  accept [:telefon_2, :epost, :hemsida]
end
```

- [ ] **Step 4: Update controller PATCH handler**

In `lead_controller.ex`, find the update/2 action. Ensure it passes `epost` and `hemsida` params through to `update_fields`. Read the controller first — it likely already passes all params, but verify.

- [ ] **Step 5: Run tests**

Run: `cd backend && mix test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: allow epost and hemsida updates on Lead"
```

---

## Task 3: Contacts Endpoints + Expanded Lead Show

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/lead_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Add controller tests

- [ ] **Step 1: Write tests**

```elixir
describe "GET /api/leads/:id/contacts" do
  test "lists contacts for lead", %{conn: conn, lead: lead} do
    {:ok, _} = Sales.create_contact(%{lead_id: lead.id, name: "Anna", role: "VD", phone: "070123"})
    conn = get(conn, "/api/leads/#{lead.id}/contacts")
    assert %{"contacts" => [%{"name" => "Anna"}]} = json_response(conn, 200)
  end
end

describe "POST /api/leads/:id/contacts" do
  test "creates contact", %{conn: conn, lead: lead} do
    conn = post(conn, "/api/leads/#{lead.id}/contacts", %{name: "Erik", phone: "070456"})
    assert %{"contact" => %{"name" => "Erik"}} = json_response(conn, 201)
  end
end

describe "GET /api/leads/:id with call_history" do
  test "includes calls in show response", %{conn: conn, lead: lead} do
    conn = get(conn, "/api/leads/#{lead.id}")
    body = json_response(conn, 200)
    assert Map.has_key?(body, "calls")
    assert Map.has_key?(body, "contacts")
  end
end
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Add contacts actions to controller**

```elixir
def list_contacts(conn, %{"lead_id" => lead_id}) do
  {:ok, contacts} = Sales.list_contacts_for_lead(lead_id)
  json(conn, %{contacts: Enum.map(contacts, &serialize_contact/1)})
end

def create_contact(conn, %{"lead_id" => lead_id} = params) do
  contact_params = Map.merge(params, %{"lead_id" => lead_id})
  case Sales.create_contact(contact_params) do
    {:ok, contact} -> conn |> put_status(201) |> json(%{contact: serialize_contact(contact)})
    {:error, err} -> conn |> put_status(422) |> json(%{error: to_string(err)})
  end
end

defp serialize_contact(c) do
  %{id: c.id, lead_id: c.lead_id, name: c.name, role: c.role, phone: c.phone, email: c.email}
end
```

- [ ] **Step 4: Expand show/2 to include contacts**

In the existing `show/2` action, load and include contacts:
```elixir
{:ok, contacts} = Sales.list_contacts_for_lead(lead.id)
# Add to json response:
contacts: Enum.map(contacts, &serialize_contact/1)
```

- [ ] **Step 5: Add routes**

In router.ex, inside the authenticated scope:
```elixir
get "/leads/:lead_id/contacts", LeadController, :list_contacts
post "/leads/:lead_id/contacts", LeadController, :create_contact
```

- [ ] **Step 6: Run tests**

Run: `cd backend && mix test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git commit -am "feat: add contacts endpoints and include contacts in lead show"
```

---

## Task 4: Frontend Types + API Hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/leads.ts`
- Create: `frontend/src/api/contacts.ts`

- [ ] **Step 1: Add Contact type**

In `frontend/src/api/types.ts`:
```typescript
export interface Contact {
  id: string;
  lead_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}
```

- [ ] **Step 2: Expand useUpdateLead**

In `frontend/src/api/leads.ts`, find `useUpdateLead`. Expand the params type to include `epost` and `hemsida`:

```typescript
interface UpdateLeadParams {
  telefon_2?: string;
  epost?: string;
  hemsida?: string;
}
```

- [ ] **Step 3: Create contacts hooks**

Create `frontend/src/api/contacts.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { Contact } from "./types";

export function useContacts(leadId: string | null) {
  return useQuery<Contact[]>({
    queryKey: ["contacts", leadId],
    queryFn: async () => {
      const data = await api<{ contacts: Contact[] }>(`/api/leads/${leadId}/contacts`);
      return data.contacts;
    },
    enabled: !!leadId,
  });
}

export function useCreateContact(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation<Contact, ApiError, { name: string; role?: string; phone?: string; email?: string }>({
    mutationFn: (params) =>
      api<{ contact: Contact }>(`/api/leads/${leadId}/contacts`, {
        method: "POST",
        body: JSON.stringify(params),
      }).then((r) => r.contact),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts", leadId] });
      void queryClient.invalidateQueries({ queryKey: ["leads", leadId] });
    },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: add Contact types and API hooks"
```

---

## Task 5: InlineEditField Component

**Files:**
- Create: `frontend/src/components/dialer/inline-edit-field.tsx`
- Create: `frontend/src/__tests__/components/dialer/inline-edit-field.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineEditField } from "@/components/dialer/inline-edit-field";

describe("InlineEditField", () => {
  it("renders value as text", () => {
    render(<InlineEditField value="test@mail.se" onSave={vi.fn()} />);
    expect(screen.getByText("test@mail.se")).toBeInTheDocument();
  });

  it("shows input on click", () => {
    render(<InlineEditField value="test@mail.se" onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("test@mail.se"));
    expect(screen.getByDisplayValue("test@mail.se")).toBeInTheDocument();
  });

  it("saves on Enter", () => {
    const onSave = vi.fn();
    render(<InlineEditField value="old@mail.se" onSave={onSave} />);
    fireEvent.click(screen.getByText("old@mail.se"));
    const input = screen.getByDisplayValue("old@mail.se");
    fireEvent.change(input, { target: { value: "new@mail.se" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("new@mail.se");
  });

  it("cancels on Escape", () => {
    const onSave = vi.fn();
    render(<InlineEditField value="old@mail.se" onSave={onSave} />);
    fireEvent.click(screen.getByText("old@mail.se"));
    const input = screen.getByDisplayValue("old@mail.se");
    fireEvent.change(input, { target: { value: "changed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("old@mail.se")).toBeInTheDocument();
  });

  it("saves on blur", () => {
    const onSave = vi.fn();
    render(<InlineEditField value="test" onSave={onSave} />);
    fireEvent.click(screen.getByText("test"));
    const input = screen.getByDisplayValue("test");
    fireEvent.change(input, { target: { value: "updated" } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith("updated");
  });

  it("shows placeholder for empty value", () => {
    render(<InlineEditField value="" placeholder="Ange e-post" onSave={vi.fn()} />);
    expect(screen.getByText("Ange e-post")).toBeInTheDocument();
  });

  it("renders as link when isLink is true", () => {
    render(<InlineEditField value="example.se" onSave={vi.fn()} isLink />);
    expect(screen.getByText("example.se ↗")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement InlineEditField**

```typescript
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";

interface InlineEditFieldProps {
  value: string | null;
  onSave: (value: string) => void;
  placeholder?: string;
  isLink?: boolean;
  className?: string;
}

export function InlineEditField({ value, onSave, placeholder, isLink, className }: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed !== (value || "")) {
      onSave(trimmed);
      setFlash(true);
      setTimeout(() => setFlash(false), 1000);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={cn(
          "text-[13px] px-1.5 py-0.5 rounded border border-[var(--color-accent)] outline-none",
          "shadow-[0_0_0_3px_rgba(79,70,229,0.1)] text-right w-[200px]",
          className,
        )}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
      />
    );
  }

  const displayValue = value || "";
  const isEmpty = !displayValue;

  return (
    <span
      onClick={() => { setDraft(value || ""); setEditing(true); }}
      className={cn(
        "text-[13px] px-1 py-0.5 rounded border border-transparent cursor-pointer",
        "hover:bg-[#EEF2FF] hover:border-[#C7D2FE]",
        isLink && "text-[var(--color-accent)]",
        isEmpty && "text-[var(--color-text-secondary)] italic text-[12px]",
        flash && "animate-[flashGreen_1s_ease-out]",
        className,
      )}
    >
      {isEmpty ? (placeholder || "Klicka för att ange") : isLink ? `${displayValue} ↗` : displayValue}
    </span>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/__tests__/components/dialer/inline-edit-field.test.tsx`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: add InlineEditField component"
```

---

## Task 6: CustomerModal Main Component

**Files:**
- Create: `frontend/src/components/dialer/customer-modal.tsx`
- Create: `frontend/src/__tests__/components/dialer/customer-modal.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomerModal } from "@/components/dialer/customer-modal";

// Mock child components
vi.mock("@/components/dialer/customer-modal-info", () => ({
  CustomerModalInfo: () => <div data-testid="info-tab">Info tab</div>,
}));
vi.mock("@/components/dialer/customer-modal-history", () => ({
  CustomerModalHistory: () => <div data-testid="history-tab">History tab</div>,
}));
vi.mock("@/api/leads", () => ({
  useLeadDetail: vi.fn(() => ({
    data: {
      lead: { id: "l1", företag: "Test AB", bransch: "IT", adress: "Gatan 1", stad: "Stockholm", orgnr: "556123" },
      calls: [{ id: "c1" }, { id: "c2" }],
    },
    isLoading: false,
  })),
  useSubmitOutcome: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("CustomerModal", () => {
  const defaultProps = {
    leadId: "l1",
    phoneNumber: "08-123456",
    callStart: Date.now(),
    onHangup: vi.fn(),
    onOutcomeSubmitted: vi.fn(),
  };

  it("renders company name in header", () => {
    render(<CustomerModal {...defaultProps} />, { wrapper });
    expect(screen.getByText("Test AB")).toBeInTheDocument();
  });

  it("shows call timer", () => {
    render(<CustomerModal {...defaultProps} />, { wrapper });
    expect(screen.getByText("Pågående samtal")).toBeInTheDocument();
  });

  it("shows quick links", () => {
    render(<CustomerModal {...defaultProps} />, { wrapper });
    expect(screen.getByText("Google ↗")).toBeInTheDocument();
    expect(screen.getByText("Maps ↗")).toBeInTheDocument();
    expect(screen.getByText("Allabolag ↗")).toBeInTheDocument();
    expect(screen.getByText("Eniro ↗")).toBeInTheDocument();
  });

  it("shows kundinfo tab by default", () => {
    render(<CustomerModal {...defaultProps} />, { wrapper });
    expect(screen.getByTestId("info-tab")).toBeInTheDocument();
  });

  it("switches to historik tab on click", () => {
    render(<CustomerModal {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByText(/Historik/));
    expect(screen.getByTestId("history-tab")).toBeInTheDocument();
  });

  it("shows historik badge with call count", () => {
    render(<CustomerModal {...defaultProps} />, { wrapper });
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows all 6 outcome buttons", () => {
    render(<CustomerModal {...defaultProps} />, { wrapper });
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Återringning")).toBeInTheDocument();
    expect(screen.getByText("Ej intresserad")).toBeInTheDocument();
    expect(screen.getByText("Ej svar")).toBeInTheDocument();
    expect(screen.getByText("Ring senare")).toBeInTheDocument();
    expect(screen.getByText("Fel nummer")).toBeInTheDocument();
  });

  it("has no close button or X", () => {
    render(<CustomerModal {...defaultProps} />, { wrapper });
    expect(screen.queryByLabelText("Stäng")).not.toBeInTheDocument();
    expect(screen.queryByText("✕")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement CustomerModal**

The main modal component containing: header (gradient), call bar (timer), quick links, tabs, and outcome section. Tab content delegated to child components.

Structure:
- Fixed overlay (no click-to-close)
- No Escape handler
- Timer via useEffect interval (same pattern as call-modal.tsx)
- Outcome buttons call `useSubmitOutcome` then `onOutcomeSubmitted`
- `useState` for activeTab ("kundinfo" | "historik")

Read `call-modal.tsx` to copy timer logic and outcome handling exactly. Use the spec's design tokens.

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

---

## Task 7: CustomerModalInfo (Kundinfo Tab)

**Files:**
- Create: `frontend/src/components/dialer/customer-modal-info.tsx`
- Create: `frontend/src/__tests__/components/dialer/customer-modal-info.test.tsx`

- [ ] **Step 1: Write tests**

Test: renders all lead fields, shows InlineEditField for epost/hemsida, shows phone numbers with Ring buttons, shows "Lägg till nummer", shows contacts, renders comments.

- [ ] **Step 2: Implement component**

Two-column layout:
- Left: phone section (list + add), detail rows (read-only except epost/hemsida which use InlineEditField), contacts section
- Right: LeadComments component (reuse existing `lead-comments.tsx`)

Phone "Ring" buttons call `useDial` hook. "Lägg till nummer" shows inline input → `useCreateContact` with phone.

- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

---

## Task 8: CustomerModalHistory (Historik Tab)

**Files:**
- Create: `frontend/src/components/dialer/customer-modal-history.tsx`
- Create: `frontend/src/__tests__/components/dialer/customer-modal-history.test.tsx`

- [ ] **Step 1: Write tests**

Test: renders call history entries with date, outcome badge, agent name, duration, recording button (when has_recording), notes.

- [ ] **Step 2: Implement component**

Full-width list of call history entries. Each entry shows:
- Date + time (13px)
- Outcome badge (emerald/amber/rose/slate colors)
- Agent name + phone number + duration (JetBrains Mono)
- RecordingPlayer component (if has_recording)
- Notes in panel background

Data comes from `useLeadDetail` calls array.

- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

---

## Task 9: Dialer Integration

**Files:**
- Modify: `frontend/src/pages/dialer.tsx`

- [ ] **Step 1: Replace CallModal with CustomerModal**

In `dialer.tsx`:
1. Replace `CallModal` import with `CustomerModal`
2. Where `CallModal` is rendered, render `CustomerModal` instead with same props pattern
3. CustomerModal receives: `leadId`, `phoneNumber`, `callStart`, `onHangup`, `onOutcomeSubmitted`
4. Ensure modal blocks all interaction (overlay with no close)
5. After outcome → auto-load next lead

Read the existing `dialer.tsx` carefully to find exactly where `CallModal` is used and how the call flow works.

- [ ] **Step 2: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: replace CallModal with CustomerModal in dialer"
```

---

## Task 10: Full Test Suite + Coverage

- [ ] **Step 1: Run backend tests with coverage**

Run: `cd backend && mix test --cover`
Expected: 100% on new files (contact.ex, lead_controller changes).

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: 0 failures, all new components covered.

- [ ] **Step 3: Fix any coverage gaps**

- [ ] **Step 4: Final commit**

```bash
git commit -am "test: ensure 100% coverage on customer modal feature"
```
