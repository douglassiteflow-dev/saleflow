import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CallModal } from "../call-modal";
import type { Lead } from "@/api/types";

// Mock all hooks used by CallModal
const mockMutate = vi.fn();
const mockHangupMutate = vi.fn();
const mockSubmitMutate = vi.fn();

vi.mock("@/api/telavox", () => ({
  useDial: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
  useHangup: vi.fn(() => ({ mutate: mockHangupMutate, isPending: false })),
}));

vi.mock("@/api/leads", () => ({
  useSubmitOutcome: vi.fn(() => ({ mutate: mockSubmitMutate, isPending: false })),
}));

vi.mock("@/api/microsoft", () => ({
  useMicrosoftStatus: vi.fn(() => ({ data: { connected: false } })),
}));

vi.mock("@/components/dialer/booking-wizard", () => ({
  BookingWizard: () => <div data-testid="meeting-modal">Meeting Modal</div>,
}));

const lead: Lead = {
  id: "lead-1",
  företag: "Testföretag AB",
  telefon: "+46701234567",
  telefon_2: null,
  epost: null,
  hemsida: null,
  adress: null,
  postnummer: null,
  stad: null,
  bransch: null,
  orgnr: null,
  omsättning_tkr: null,
  vinst_tkr: null,
  anställda: null,
  vd_namn: null,
  bolagsform: null,
  källa: null,
  status: "assigned",
  quarantine_until: null,
  callback_at: null,
  callback_reminded_at: null,
  imported_at: null,
  inserted_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CallModal", () => {
  it("renders with lead name and phone", () => {
    render(<CallModal lead={lead} leadId="lead-1" onClose={() => {}} />);

    expect(screen.getByText("Testföretag AB")).toBeInTheDocument();
    expect(screen.getByText("+46701234567")).toBeInTheDocument();
  });

  it("shows timer counting from 0:00", () => {
    render(<CallModal lead={lead} leadId="lead-1" onClose={() => {}} />);

    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("shows hangup button", () => {
    render(<CallModal lead={lead} leadId="lead-1" onClose={() => {}} />);

    expect(screen.getByText("Lägg på")).toBeInTheDocument();
  });

  it("shows outcome buttons after clicking hangup", () => {
    render(<CallModal lead={lead} leadId="lead-1" onClose={() => {}} />);

    fireEvent.click(screen.getByText("Lägg på"));

    expect(mockHangupMutate).toHaveBeenCalled();
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Återuppringning")).toBeInTheDocument();
    expect(screen.getByText("Ej intresserad")).toBeInTheDocument();
    expect(screen.getByText("Ej svar")).toBeInTheDocument();
    expect(screen.getByText("Ring senare")).toBeInTheDocument();
    expect(screen.getByText("Fel nummer")).toBeInTheDocument();
  });

  it("hides hangup button after clicking it", () => {
    render(<CallModal lead={lead} leadId="lead-1" onClose={() => {}} />);

    fireEvent.click(screen.getByText("Lägg på"));

    expect(screen.queryByText("Lägg på")).not.toBeInTheDocument();
  });

  it("shows Avslutat badge after hangup", () => {
    render(<CallModal lead={lead} leadId="lead-1" onClose={() => {}} />);

    fireEvent.click(screen.getByText("Lägg på"));

    expect(screen.getByText("Avslutat")).toBeInTheDocument();
  });

  it("calls submitOutcome when clicking an outcome button", () => {
    render(<CallModal lead={lead} leadId="lead-1" onClose={() => {}} />);

    fireEvent.click(screen.getByText("Lägg på"));
    fireEvent.click(screen.getByText("Ej svar"));

    expect(mockSubmitMutate).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "no_answer" }),
      expect.any(Object),
    );
  });

  it("opens meeting modal when clicking Möte bokat", () => {
    render(<CallModal lead={lead} leadId="lead-1" onClose={() => {}} />);

    fireEvent.click(screen.getByText("Lägg på"));
    fireEvent.click(screen.getByText("Möte bokat"));

    expect(screen.getByTestId("meeting-modal")).toBeInTheDocument();
    // submitOutcome should NOT be called for meeting_booked — modal handles it
    expect(mockSubmitMutate).not.toHaveBeenCalled();
  });
});
