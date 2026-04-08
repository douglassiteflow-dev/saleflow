import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingWizard } from "@/components/dialer/booking-wizard";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/api/leads", () => ({
  useSubmitOutcome: vi.fn(),
}));

vi.mock("@/lib/date", () => ({
  todayISO: vi.fn(() => "2026-04-08"),
}));

// Mock TimeSelect to avoid select complexity in tests
vi.mock("@/components/ui/time-select", () => ({
  TimeSelect: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input
      aria-label="Tid"
      data-testid="time-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { useSubmitOutcome } from "@/api/leads";

const mockUseSubmitOutcome = vi.mocked(useSubmitOutcome);

// ── Test data ──────────────────────────────────────────────────────────────

const SAMPLE_LEAD = {
  id: "lead-1",
  företag: "Testbolaget AB",
  telefon: "+46701234567",
  telefon_2: null,
  epost: "info@testbolaget.se",
  hemsida: null,
  adress: "Storgatan 1",
  postnummer: "11122",
  stad: "Stockholm",
  bransch: "IT",
  orgnr: "5566778899",
  omsättning_tkr: "5000",
  vinst_tkr: null,
  anställda: null,
  vd_namn: "Anna Svensson",
  bolagsform: null,
  källa: "Import",
  status: "assigned" as const,
  quarantine_until: null,
  callback_at: null,
  callback_reminded_at: null,
  imported_at: "2026-03-15T10:00:00Z",
  inserted_at: "2026-03-15T10:00:00Z",
  updated_at: "2026-03-15T10:00:00Z",
};

const DEFAULT_PROPS = {
  leadId: "lead-1",
  lead: SAMPLE_LEAD,
  isOpen: true,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  isMsConnected: false,
};

function renderWizard(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  return render(<BookingWizard {...props} />);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("BookingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSubmitOutcome.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useSubmitOutcome>);
  });

  // 1. Renders step 1 by default with all fields
  it("renders step 1 by default with all fields", () => {
    renderWizard();

    expect(screen.getByText("Steg 1 av 2")).toBeInTheDocument();
    expect(screen.getByText("Mötesinbjudan")).toBeInTheDocument();
    expect(screen.getByTestId("time-select")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nästa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
  });

  // 2. Pre-fills title with "Möte med {lead.företag}"
  it("pre-fills title with lead company name", () => {
    renderWizard();

    const titleInput = screen.getByPlaceholderText("Möte med Testbolaget AB");
    expect(titleInput).toBeInTheDocument();

    // The actual value should also be pre-filled
    const inputs = screen.getAllByDisplayValue("Möte med Testbolaget AB");
    expect(inputs.length).toBeGreaterThan(0);
  });

  // 3. Pre-fills email from lead.epost and name from lead.vd_namn
  it("pre-fills email and name from lead data", () => {
    renderWizard();

    expect(screen.getByDisplayValue("info@testbolaget.se")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Anna Svensson")).toBeInTheDocument();
  });

  // 4. "Nästa" button disabled when date or time is empty
  it("disables Nästa button when date is empty", () => {
    renderWizard();

    const nastaBtn = screen.getByRole("button", { name: "Nästa" });
    expect(nastaBtn).toBeDisabled();
  });

  it("disables Nästa button when time is empty but date is filled", async () => {
    const user = userEvent.setup();
    renderWizard();

    // Fill date but leave time empty
    const dateInputEl = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInputEl, "2026-05-01");

    // time-select is still empty (default value "")
    const nastaBtn = screen.getByRole("button", { name: "Nästa" });
    expect(nastaBtn).toBeDisabled();
  });

  // 5. Clicking "Nästa" with valid step 1 shows step 2
  it("clicking Nästa with valid date and time advances to step 2", async () => {
    const user = userEvent.setup();
    renderWizard();

    // Fill date
    const dateInputEl = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInputEl, "2026-05-01");

    // Fill time via mocked TimeSelect
    const timeInput = screen.getByTestId("time-select");
    await user.clear(timeInput);
    await user.type(timeInput, "09:00");

    const nastaBtn = screen.getByRole("button", { name: "Nästa" });
    await user.click(nastaBtn);

    expect(screen.getByText("Steg 2 av 2")).toBeInTheDocument();
    expect(screen.getByText("Konfigurera demo")).toBeInTheDocument();
  });

  // 6. Step 2 shows demo source radio options
  it("step 2 shows Bokadirekt radio question", async () => {
    const user = userEvent.setup();
    renderWizard();

    // Fill date + time then go to step 2
    const dateInputEl = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInputEl, "2026-05-01");
    const timeInput = screen.getByTestId("time-select");
    await user.type(timeInput, "09:00");
    await user.click(screen.getByRole("button", { name: "Nästa" }));

    expect(screen.getByText("Har kunden Bokadirekt?")).toBeInTheDocument();
    expect(screen.getByLabelText("Ja")).toBeInTheDocument();
    expect(screen.getByLabelText("Nej")).toBeInTheDocument();
  });

  // 7. "Tillbaka" returns to step 1
  it("clicking Tillbaka returns to step 1", async () => {
    const user = userEvent.setup();
    renderWizard();

    const dateInputEl = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInputEl, "2026-05-01");
    const timeInput = screen.getByTestId("time-select");
    await user.type(timeInput, "09:00");
    await user.click(screen.getByRole("button", { name: "Nästa" }));

    expect(screen.getByText("Steg 2 av 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tillbaka" }));

    expect(screen.getByText("Steg 1 av 2")).toBeInTheDocument();
    expect(screen.getByText("Mötesinbjudan")).toBeInTheDocument();
  });

  // Helper: advance to step 2
  async function goToStep2(user: ReturnType<typeof userEvent.setup>) {
    const dateInputEl = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInputEl, "2026-05-01");
    const timeInput = screen.getByTestId("time-select");
    await user.type(timeInput, "09:00");
    await user.click(screen.getByRole("button", { name: "Nästa" }));
  }

  // 8. Selecting "Ja" (Bokadirekt) shows URL input
  it("selecting Ja shows Bokadirekt URL input", async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Ja"));

    expect(screen.getByPlaceholderText(/bokadirekt\.se/i)).toBeInTheDocument();
  });

  // 9. Selecting "Befintlig hemsida" shows URL input
  it("selecting Befintlig hemsida shows website URL input", async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Nej"));
    await user.click(screen.getByLabelText("Befintlig hemsida"));

    expect(screen.getByPlaceholderText(/företaget\.se/i)).toBeInTheDocument();
  });

  // 10. Selecting "Manuellt" shows textarea
  it("selecting Manuellt shows company info textarea", async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Nej"));
    await user.click(screen.getByLabelText("Manuellt"));

    expect(screen.getByPlaceholderText(/beskriv företaget/i)).toBeInTheDocument();
  });

  // 11. "Slutför" disabled when required fields empty
  it("Slutför button is disabled when no source is configured", async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    const slutforBtn = screen.getByRole("button", { name: "Slutför" });
    expect(slutforBtn).toBeDisabled();
  });

  it("Slutför button is disabled when Ja selected but URL is empty", async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Ja"));

    const slutforBtn = screen.getByRole("button", { name: "Slutför" });
    expect(slutforBtn).toBeDisabled();
  });

  it("Slutför button is enabled when Ja selected and URL is filled", async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Ja"));
    const urlInput = screen.getByPlaceholderText(/bokadirekt\.se/i);
    await user.type(urlInput, "https://www.bokadirekt.se/places/test");

    const slutforBtn = screen.getByRole("button", { name: "Slutför" });
    expect(slutforBtn).toBeEnabled();
  });

  it("Slutför button is enabled when Manuellt selected and info is filled", async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Nej"));
    await user.click(screen.getByLabelText("Manuellt"));
    const textarea = screen.getByPlaceholderText(/beskriv företaget/i);
    await user.type(textarea, "Företaget säljer IT-tjänster");

    const slutforBtn = screen.getByRole("button", { name: "Slutför" });
    expect(slutforBtn).toBeEnabled();
  });

  // 12. Calls onClose when Avbryt is clicked
  it("calls onClose when Avbryt is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWizard({ onClose });

    await user.click(screen.getByRole("button", { name: "Avbryt" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  // Additional: does not render when isOpen is false
  it("renders nothing when isOpen is false", () => {
    renderWizard({ isOpen: false });
    expect(screen.queryByText("Boka möte")).not.toBeInTheDocument();
  });

  // Additional: Teams checkbox disabled when not connected
  it("Teams checkbox is disabled when isMsConnected is false", () => {
    renderWizard({ isMsConnected: false });
    const teamsCheckbox = screen.getByRole("checkbox");
    expect(teamsCheckbox).toBeDisabled();
  });

  it("Teams checkbox is enabled when isMsConnected is true", () => {
    renderWizard({ isMsConnected: true });
    const teamsCheckbox = screen.getByRole("checkbox");
    expect(teamsCheckbox).toBeEnabled();
  });

  // Additional: calls submitOutcome.mutate on successful submission
  it("calls submitOutcome mutate when Slutför is clicked with valid data", async () => {
    const mutateMock = vi.fn();
    mockUseSubmitOutcome.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as ReturnType<typeof useSubmitOutcome>);

    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Ja"));
    const urlInput = screen.getByPlaceholderText(/bokadirekt\.se/i);
    await user.type(urlInput, "https://www.bokadirekt.se/places/test");

    await user.click(screen.getByRole("button", { name: "Slutför" }));

    expect(mutateMock).toHaveBeenCalledOnce();
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "meeting_booked",
        source_url: "https://www.bokadirekt.se/places/test",
      }),
      expect.any(Object),
    );
  });

  // 13. Error message is displayed when submission fails
  it("displays error message when submission fails", async () => {
    const mutateMock = vi.fn((_, callbacks) => {
      callbacks.onError(new Error("Serverfel"));
    });
    mockUseSubmitOutcome.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as ReturnType<typeof useSubmitOutcome>);

    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Ja"));
    const urlInput = screen.getByPlaceholderText(/bokadirekt\.se/i);
    await user.type(urlInput, "https://www.bokadirekt.se/places/test");
    await user.click(screen.getByRole("button", { name: "Slutför" }));

    expect(screen.getByText("Serverfel")).toBeInTheDocument();
  });

  // 14. "Försök igen" button is visible on error
  it("shows Försök igen button when submission fails", async () => {
    const mutateMock = vi.fn((_, callbacks) => {
      callbacks.onError(new Error("Nätverksfel"));
    });
    mockUseSubmitOutcome.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as ReturnType<typeof useSubmitOutcome>);

    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Ja"));
    const urlInput = screen.getByPlaceholderText(/bokadirekt\.se/i);
    await user.type(urlInput, "https://www.bokadirekt.se/places/test");
    await user.click(screen.getByRole("button", { name: "Slutför" }));

    expect(screen.getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
  });

  // 15. Submission with "Befintlig hemsida" uses the website URL as source_url
  it("submits with correct source_url when Befintlig hemsida is selected", async () => {
    const mutateMock = vi.fn();
    mockUseSubmitOutcome.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as ReturnType<typeof useSubmitOutcome>);

    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Nej"));
    await user.click(screen.getByLabelText("Befintlig hemsida"));
    const urlInput = screen.getByPlaceholderText(/företaget\.se/i);
    await user.type(urlInput, "https://www.testbolaget.se");

    await user.click(screen.getByRole("button", { name: "Slutför" }));

    expect(mutateMock).toHaveBeenCalledOnce();
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "meeting_booked",
        source_url: "https://www.testbolaget.se",
      }),
      expect.any(Object),
    );
  });

  // 16. File input is visible in "Manuellt" mode
  it("shows file input for logo upload in Manuellt mode", async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByLabelText("Nej"));
    await user.click(screen.getByLabelText("Manuellt"));

    const fileInput = screen.getByLabelText("Ladda upp logotyp");
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute("type", "file");
    expect(fileInput).toHaveAttribute("accept", "image/*");
  });
});
