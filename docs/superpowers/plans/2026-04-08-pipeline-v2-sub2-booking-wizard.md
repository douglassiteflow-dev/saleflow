# Pipeline v2 Sub-plan 2: Booking Wizard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MeetingBookingModal with a 2-step wizard that creates a meeting + triggers demo generation, and auto-advances Deal to `demo_scheduled` when generation completes.

**Architecture:** Keep existing DemoConfig + DemoGenerationWorker as the generation engine. The wizard is a new frontend component. Backend change: DemoGenerationWorker auto-advances the linked Deal when generation succeeds. DemoConfig continues to track generation state; Deal tracks pipeline state.

**Tech Stack:** Elixir/Ash/Oban (backend), React/TypeScript/Tailwind/shadcn (frontend), Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/lib/saleflow/workers/demo_generation_worker.ex` | Auto-advance Deal to `demo_scheduled` + save website_url on Deal |
| Modify | `backend/lib/saleflow_web/controllers/lead_controller.ex` | Outcome flow: ensure Deal starts at `booking_wizard`, advance only after wizard completes |
| Create | `frontend/src/components/dialer/booking-wizard.tsx` | New 2-step wizard modal (replaces MeetingBookingModal for deal flow) |
| Modify | `frontend/src/components/dialer/customer-modal.tsx` | Use BookingWizard instead of MeetingBookingModal |
| Modify | `frontend/src/pages/dialer.tsx` | Wire up BookingWizard state |
| Create | `frontend/src/__tests__/components/dialer/booking-wizard.test.tsx` | Tests for wizard |
| Modify | `backend/test/saleflow/workers/demo_generation_worker_test.exs` | Test Deal auto-advance |

---

### Task 1: Backend — DemoGenerationWorker auto-advances Deal

**Files:**
- Modify: `backend/lib/saleflow/workers/demo_generation_worker.ex`

- [ ] **Step 1: Read current worker file**

Read `backend/lib/saleflow/workers/demo_generation_worker.ex` to understand current flow.

- [ ] **Step 2: Add Deal auto-advance after successful generation**

After the worker calls `Sales.generation_complete(demo_config, ...)` and it succeeds, add logic to:
1. Load the DemoConfig's linked meeting(s) to find the `deal_id`
2. If a deal exists and is at `:booking_wizard`, advance it to `:demo_scheduled`
3. Save the `website_url` (preview_url) on the Deal

Add this function to the worker module:

```elixir
defp maybe_advance_deal(demo_config) do
  alias Saleflow.Sales

  case Sales.list_meetings_for_demo_config(demo_config.id) do
    {:ok, meetings} ->
      meetings
      |> Enum.find(& &1.deal_id)
      |> case do
        nil -> :ok
        meeting ->
          case Sales.get_deal(meeting.deal_id) do
            {:ok, deal} when deal.stage == :booking_wizard ->
              # Save preview_url on deal and advance
              preview_url = demo_config.preview_url
              {:ok, deal} = Sales.update_deal(deal, %{website_url: preview_url})
              Sales.advance_deal(deal)

            _ -> :ok
          end
      end

    _ -> :ok
  end
end
```

Call `maybe_advance_deal(demo_config)` right after the `generation_complete` call succeeds in the `perform/1` function.

- [ ] **Step 3: Verify backend compiles**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix compile`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add backend/lib/saleflow/workers/demo_generation_worker.ex
git commit -m "feat(pipeline-v2): auto-advance deal to demo_scheduled after generation"
```

---

### Task 2: Backend test — Deal auto-advance on generation

**Files:**
- Modify: `backend/test/saleflow/workers/demo_generation_worker_test.exs`

- [ ] **Step 1: Read current test file**

Read `backend/test/saleflow/workers/demo_generation_worker_test.exs`.

- [ ] **Step 2: Add test for Deal auto-advance**

Add a new test in the worker test module that verifies:
1. Create a lead, user, deal (at `:booking_wizard`), demo_config, and meeting linked to both
2. Simulate generation complete (call `Sales.generation_complete(demo_config, %{website_path: path, preview_url: url})`)
3. Call `maybe_advance_deal(demo_config)` or simulate the worker flow
4. Assert deal is now at `:demo_scheduled`
5. Assert deal.website_url matches the preview_url

Note: The worker uses Claude CLI which we can't run in tests. Focus on testing the `maybe_advance_deal` logic. If the function is private, either make it public with `@doc false` or test through the integration path.

- [ ] **Step 3: Run worker tests**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix test test/saleflow/workers/demo_generation_worker_test.exs --trace`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/test/saleflow/workers/demo_generation_worker_test.exs
git commit -m "test(pipeline-v2): add test for deal auto-advance on generation complete"
```

---

### Task 3: Frontend — BookingWizard component

**Files:**
- Create: `frontend/src/components/dialer/booking-wizard.tsx`

- [ ] **Step 1: Read existing MeetingBookingModal for reference**

Read `frontend/src/components/meeting-booking-modal.tsx` to understand current form fields and submit logic.

- [ ] **Step 2: Build BookingWizard component**

Create a new component with these specs:

**Props:**
```typescript
interface BookingWizardProps {
  leadId: string;
  lead: Lead;  // For pre-filling fields
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isMsConnected: boolean;
}
```

**State:**
```typescript
step: 1 | 2
// Step 1 fields (meeting)
title: string          // default: "Möte med {lead.företag}"
date: string           // required
time: string           // required
duration: number       // default: 30
customerEmail: string  // from lead.epost
customerName: string   // from lead.vd_namn
notes: string
sendTeams: boolean     // default: true if MS connected
// Step 2 fields (demo config)
demoSource: "bokadirekt" | "website" | "manual"
sourceUrl: string      // URL for bokadirekt or website
// manual fields (for when no URL available)
companyInfo: string
logoFile: File | null
```

**Layout:**
- Dialog/modal overlay (use shadcn Dialog or Sheet)
- Step indicator at top: "Steg 1 av 2" / "Steg 2 av 2"
- Step 1: Meeting invite form (same fields as MeetingBookingModal)
- Step 2: Demo configuration
  - Radio group: "Har kunden Bokadirekt?" → Yes/No
    - Yes: URL input for Bokadirekt link
    - No: Radio group: "Befintlig hemsida" / "Manuellt"
      - Befintlig hemsida: URL input
      - Manuellt: Textarea for company info + file upload for logo
- Footer: "Tillbaka" (step 2 only) | "Nästa" (step 1) / "Slutför" (step 2)

**Submit flow:**
- On "Slutför", call the existing `useSubmitOutcome(leadId)` mutation with:
  ```typescript
  {
    outcome: "meeting_booked",
    meeting_date: date,
    meeting_time: time,
    meeting_duration: duration,
    title: title,
    customer_email: customerEmail,
    customer_name: customerName,
    meeting_notes: notes,
    create_teams_meeting: sendTeams,
    source_url: sourceUrl,  // from step 2 (bokadirekt or website URL)
  }
  ```
- Show spinner on "Slutför" button: "Genererar demo..."
- On success: toast "Demo schemalagd för {lead.företag}", call onSuccess()
- On error: show error inline, allow retry

**Validation:**
- Step 1: date and time required, date >= today
- Step 2: if bokadirekt or website selected, URL required and must be valid URL
- Step 2: if manual, companyInfo required

**UX:**
- All labels and text in Swedish
- Inline validation with clear error messages
- "Nästa" disabled until step 1 is valid
- "Slutför" disabled until step 2 is valid + while submitting

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dialer/booking-wizard.tsx
git commit -m "feat(pipeline-v2): add BookingWizard component for 2-step meeting booking"
```

---

### Task 4: Frontend — BookingWizard tests

**Files:**
- Create: `frontend/src/__tests__/components/dialer/booking-wizard.test.tsx`

- [ ] **Step 1: Read existing MeetingBookingModal tests for patterns**

Check if `frontend/src/__tests__/components/meeting-booking-modal.test.tsx` exists and read it for test patterns.

- [ ] **Step 2: Write tests**

Test cases:
1. Renders step 1 by default with correct fields
2. Pre-fills title with "Möte med {lead.företag}"
3. Pre-fills email and name from lead
4. "Nästa" button disabled when date/time empty
5. "Nästa" advances to step 2
6. Step 2 shows demo source options
7. "Tillbaka" button returns to step 1
8. Selecting "Bokadirekt" shows URL input
9. Selecting "Befintlig hemsida" shows URL input
10. Selecting "Manuellt" shows textarea + file upload
11. "Slutför" button disabled when URL empty (for bokadirekt/website)
12. Submitting calls onSuccess callback

Use the project's existing test patterns (vitest, @testing-library/react, MSW or manual mocks).

- [ ] **Step 3: Run tests**

Run: `cd /Users/douglassiteflow/dev/saleflow/frontend && npx vitest run src/__tests__/components/dialer/booking-wizard.test.tsx`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/__tests__/components/dialer/booking-wizard.test.tsx
git commit -m "test(pipeline-v2): add BookingWizard component tests"
```

---

### Task 5: Frontend — Wire up BookingWizard in dialer

**Files:**
- Modify: `frontend/src/components/dialer/customer-modal.tsx`
- Modify: `frontend/src/pages/dialer.tsx`

- [ ] **Step 1: Read customer-modal.tsx and dialer.tsx**

Read both files to understand current MeetingBookingModal integration.

- [ ] **Step 2: Update customer-modal.tsx**

Replace MeetingBookingModal import with BookingWizard:
```typescript
import { BookingWizard } from "./booking-wizard";
```

Replace MeetingBookingModal usage with BookingWizard, passing the same props (lead, isOpen, onClose, onSuccess, isMsConnected).

- [ ] **Step 3: Update dialer.tsx if needed**

If MeetingBookingModal state is managed in dialer.tsx, update the state management to work with BookingWizard.

- [ ] **Step 4: Run affected tests**

Run: `cd /Users/douglassiteflow/dev/saleflow/frontend && npx vitest run`
Expected: All tests pass. Fix any failures caused by the modal swap.

- [ ] **Step 5: Run TypeScript check**

Run: `cd /Users/douglassiteflow/dev/saleflow/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dialer/customer-modal.tsx frontend/src/pages/dialer.tsx
git commit -m "feat(pipeline-v2): wire BookingWizard into customer-modal and dialer"
```

---

### Task 6: Final validation

- [ ] **Step 1: Run full backend tests**

Run: `cd /Users/douglassiteflow/dev/saleflow/backend && mix test --trace`
Expected: All tests pass.

- [ ] **Step 2: Run full frontend tests**

Run: `cd /Users/douglassiteflow/dev/saleflow/frontend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: TypeScript check**

Run: `cd /Users/douglassiteflow/dev/saleflow/frontend && npx tsc --noEmit`
Expected: No errors.
