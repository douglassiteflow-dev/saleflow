import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerModal } from "@/components/dialer/customer-modal";

vi.mock("@/api/leads", () => ({
  useLeadDetail: vi.fn(),
  useSubmitOutcome: vi.fn(),
}));

vi.mock("@/api/telavox", () => ({
  useDial: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/api/microsoft", () => ({
  useMicrosoftStatus: vi.fn(),
}));

vi.mock("@/components/dialer/customer-modal-info", () => ({
  CustomerModalInfo: () => <div data-testid="info-tab" />,
}));

vi.mock("@/components/dialer/customer-modal-history", () => ({
  CustomerModalHistory: () => <div data-testid="history-tab" />,
}));

vi.mock("@/components/dialer/booking-wizard", () => ({
  BookingWizard: () => <div data-testid="meeting-booking-modal" />,
}));

import { useLeadDetail, useSubmitOutcome } from "@/api/leads";
import { useMicrosoftStatus } from "@/api/microsoft";

const mockUseLeadDetail = vi.mocked(useLeadDetail);
const mockUseSubmitOutcome = vi.mocked(useSubmitOutcome);
const mockUseMicrosoftStatus = vi.mocked(useMicrosoftStatus);

const SAMPLE_LEAD = {
  id: "lead-1",
  företag: "Testföretag AB",
  telefon: "+46701234567",
  telefon_2: null,
  epost: "info@test.se",
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

const SAMPLE_CALLS = [
  {
    id: "call-1",
    lead_id: "lead-1",
    user_id: "user-1",
    user_name: "Agent",
    outcome: "no_answer" as const,
    notes: null,
    called_at: "2026-03-20T14:00:00Z",
    duration: 30,
    has_recording: false,
  },
  {
    id: "call-2",
    lead_id: "lead-1",
    user_id: "user-1",
    user_name: "Agent",
    outcome: "callback" as const,
    notes: "Ring tillbaka imorgon",
    called_at: "2026-03-21T09:00:00Z",
    duration: 120,
    has_recording: false,
  },
];

const mutateFn = vi.fn();

const defaultProps = {
  leadId: "lead-1",
  phoneNumber: "+46701234567",
  callStart: Date.now() - 5000,
  hungUp: false,
  duration: 0,
  onHangup: vi.fn(),
  onOutcomeSubmitted: vi.fn(),
};

describe("CustomerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockUseLeadDetail.mockReturnValue({
      data: { lead: SAMPLE_LEAD, calls: SAMPLE_CALLS },
      isLoading: false,
    } as ReturnType<typeof useLeadDetail>);

    mockUseSubmitOutcome.mockReturnValue({
      mutate: mutateFn,
      isPending: false,
    } as unknown as ReturnType<typeof useSubmitOutcome>);

    mockUseMicrosoftStatus.mockReturnValue({
      data: { connected: false },
    } as ReturnType<typeof useMicrosoftStatus>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders company name from lead data", () => {
    render(<CustomerModal {...defaultProps} />);
    expect(screen.getByText("Testföretag AB")).toBeInTheDocument();
  });

  it("renders subtitle with bransch, adress, and orgnr", () => {
    render(<CustomerModal {...defaultProps} />);
    expect(screen.getByText("IT \u00b7 Storgatan 1 \u00b7 5566778899")).toBeInTheDocument();
  });

  it("shows call timer with 'Pågående samtal' when call is active", () => {
    render(<CustomerModal {...defaultProps} />);
    expect(screen.getByText("Pågående samtal")).toBeInTheDocument();

    // Timer starts at 0:00, advances after first interval tick
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // After 1s tick, timer recalculates from callStart (5s ago + 1s)
    expect(screen.getByText("0:06")).toBeInTheDocument();
  });

  it("updates timer every second", () => {
    const start = Date.now();
    render(<CustomerModal {...defaultProps} callStart={start} />);

    expect(screen.getByText("0:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("0:03")).toBeInTheDocument();
  });

  it("hides call bar after hangup", () => {
    render(<CustomerModal {...defaultProps} hungUp={true} duration={45} />);
    expect(screen.queryByText("Pågående samtal")).not.toBeInTheDocument();
    expect(screen.queryByText("Lägg på")).not.toBeInTheDocument();
  });

  it("shows Lägg på button during active call", () => {
    render(<CustomerModal {...defaultProps} />);
    expect(screen.getByText("Lägg på")).toBeInTheDocument();
  });

  it("calls onHangup when Lägg på is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onHangup = vi.fn();
    render(<CustomerModal {...defaultProps} onHangup={onHangup} />);

    await user.click(screen.getByText("Lägg på"));
    expect(onHangup).toHaveBeenCalledOnce();
  });

  it("shows quick links for Google, Maps, Allabolag, and Eniro", () => {
    render(<CustomerModal {...defaultProps} />);

    expect(screen.getByText("Google ↗")).toBeInTheDocument();
    expect(screen.getByText("Maps ↗")).toBeInTheDocument();
    expect(screen.getByText("Allabolag ↗")).toBeInTheDocument();
    expect(screen.getByText("Eniro ↗")).toBeInTheDocument();
  });

  it("quick links have correct target and rel attributes", () => {
    render(<CustomerModal {...defaultProps} />);

    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("shows Kundinfo tab by default", () => {
    render(<CustomerModal {...defaultProps} />);

    expect(screen.getByText("Kundinfo")).toBeInTheDocument();
    expect(screen.getByTestId("info-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("history-tab")).not.toBeInTheDocument();
  });

  it("switches to Historik tab on click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CustomerModal {...defaultProps} />);

    await user.click(screen.getByText(/^Historik/));

    expect(screen.getByTestId("history-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("info-tab")).not.toBeInTheDocument();
  });

  it("shows historik badge with call count", () => {
    render(<CustomerModal {...defaultProps} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not show historik badge when no calls", () => {
    mockUseLeadDetail.mockReturnValue({
      data: { lead: SAMPLE_LEAD, calls: [] },
      isLoading: false,
    } as ReturnType<typeof useLeadDetail>);

    render(<CustomerModal {...defaultProps} />);

    const historikBtn = screen.getByText("Historik");
    // No badge span inside the button
    expect(historikBtn.querySelector("span")).toBeNull();
  });

  it("hides outcome buttons during active call", () => {
    render(<CustomerModal {...defaultProps} hungUp={false} />);

    expect(screen.queryByText("Möte bokat")).not.toBeInTheDocument();
    expect(screen.queryByText("Återringning")).not.toBeInTheDocument();
    expect(screen.queryByText("Ej intresserad")).not.toBeInTheDocument();
    expect(screen.queryByText("Ej svar")).not.toBeInTheDocument();
    expect(screen.queryByText("Ring senare")).not.toBeInTheDocument();
    expect(screen.queryByText("Fel nummer")).not.toBeInTheDocument();
  });

  it("shows all 6 outcome buttons after hangup", () => {
    render(<CustomerModal {...defaultProps} hungUp={true} duration={30} />);

    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Återringning")).toBeInTheDocument();
    expect(screen.getByText("Ej intresserad")).toBeInTheDocument();
    expect(screen.getByText("Ej svar")).toBeInTheDocument();
    expect(screen.getByText("Ring senare")).toBeInTheDocument();
    expect(screen.getByText("Fel nummer")).toBeInTheDocument();
  });

  it("has no close button or X", () => {
    render(<CustomerModal {...defaultProps} />);

    expect(screen.queryByLabelText(/close/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/stäng/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "X" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "\u00d7" })).not.toBeInTheDocument();
  });

  it("outcome buttons are visible and clickable after hangup", () => {
    render(<CustomerModal {...defaultProps} hungUp={true} duration={30} />);

    const outcomeButtons = [
      "Möte bokat", "Återringning", "Ej intresserad",
      "Ej svar", "Ring senare", "Fel nummer",
    ];

    for (const label of outcomeButtons) {
      const btn = screen.getByText(label);
      expect(btn).toBeVisible();
      expect(btn).not.toBeDisabled();
    }
  });

  it("submits outcome when a non-meeting outcome is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CustomerModal {...defaultProps} hungUp={true} duration={60} />);

    await user.click(screen.getByText("Ej svar"));

    expect(mutateFn).toHaveBeenCalledOnce();
    expect(mutateFn).toHaveBeenCalledWith(
      { outcome: "no_answer", notes: undefined, duration: 60 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("opens MeetingBookingModal when 'Möte bokat' is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CustomerModal {...defaultProps} hungUp={true} duration={60} />);

    await user.click(screen.getByText("Möte bokat"));

    expect(mutateFn).not.toHaveBeenCalled();
    expect(screen.getByTestId("meeting-booking-modal")).toBeInTheDocument();
  });

  it("calls onOutcomeSubmitted on successful submit", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onOutcomeSubmitted = vi.fn();

    mutateFn.mockImplementation((_params: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });

    render(<CustomerModal {...defaultProps} hungUp={true} duration={60} onOutcomeSubmitted={onOutcomeSubmitted} />);

    await user.click(screen.getByText("Ej intresserad"));

    expect(onOutcomeSubmitted).toHaveBeenCalledOnce();
  });

  it("shows error message on submit failure", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mutateFn.mockImplementation((_params: unknown, opts: { onError: (err: { message: string }) => void }) => {
      opts.onError({ message: "Servern svarade inte" });
    });

    render(<CustomerModal {...defaultProps} hungUp={true} duration={60} />);

    await user.click(screen.getByText("Ej svar"));

    expect(screen.getByText("Servern svarade inte")).toBeInTheDocument();
  });

  it("shows 'Stängs bara via utfall' in footer", () => {
    render(<CustomerModal {...defaultProps} />);
    expect(screen.getByText("Stängs bara via utfall")).toBeInTheDocument();
  });

  it("shows import date and source in footer", () => {
    render(<CustomerModal {...defaultProps} />);
    expect(screen.getByText(/Importerad.*2026-03-15.*via Import/)).toBeInTheDocument();
  });

  it("shows phone number in call bar", () => {
    render(<CustomerModal {...defaultProps} />);
    expect(screen.getByText("+46701234567")).toBeInTheDocument();
  });

  it("includes notes when submitting outcome", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CustomerModal {...defaultProps} hungUp={true} duration={30} />);

    const textarea = screen.getByPlaceholderText("Anteckningar (valfritt)...");
    await user.type(textarea, "Kunden var inte intresserad");
    await user.click(screen.getByText("Ej intresserad"));

    expect(mutateFn).toHaveBeenCalledWith(
      { outcome: "not_interested", notes: "Kunden var inte intresserad", duration: 30 },
      expect.any(Object),
    );
  });

  it("shows fallback text when lead data is loading", () => {
    mockUseLeadDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useLeadDetail>);

    render(<CustomerModal {...defaultProps} />);
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("renders notes textarea after hangup", () => {
    render(<CustomerModal {...defaultProps} hungUp={true} duration={30} />);
    expect(screen.getByPlaceholderText("Anteckningar (valfritt)...")).toBeInTheDocument();
  });

  it("hides notes textarea during active call", () => {
    render(<CustomerModal {...defaultProps} hungUp={false} />);
    expect(screen.queryByPlaceholderText("Anteckningar (valfritt)...")).not.toBeInTheDocument();
  });

  it("renders as fixed overlay covering entire screen", () => {
    render(<CustomerModal {...defaultProps} />);
    // The overlay container has fixed inset-0 z-50
    const overlay = screen.getByText("Testföretag AB").closest(".fixed.inset-0");
    expect(overlay).toBeInTheDocument();
  });
});
