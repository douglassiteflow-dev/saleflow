import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialerPage } from "../dialer";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const nextLeadMutateMock = vi.fn();
const useLeadDetailMock = vi.fn();
const useNextLeadMock = vi.fn();
const outcomeSubmitMock = vi.fn();

vi.mock("@/api/leads", () => ({
  useNextLead: () => useNextLeadMock(),
  useLeadDetail: () => useLeadDetailMock(),
  useSubmitOutcome: vi.fn(() => ({
    mutate: outcomeSubmitMock,
    isPending: false,
  })),
  useCallbacks: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("@/api/dashboard", () => ({
  useLeaderboard: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("@/api/auth", () => ({
  useMe: vi.fn(() => ({ data: { id: "user-1", name: "Test", role: "agent" } })),
}));

vi.mock("@/api/calls", () => ({
  useCallHistory: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("@/api/meetings", () => ({
  useMeetings: vi.fn(() => ({ data: [], isLoading: false })),
  useCancelMeeting: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/api/telavox", () => ({
  useTelavoxStatus: vi.fn(() => ({ data: undefined })),
  useDial: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useHangup: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/api/microsoft", () => ({
  useMicrosoftStatus: vi.fn(() => ({ data: { connected: false } })),
}));

vi.mock("@/api/comments", () => ({
  useLeadComments: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateComment: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const mockLeadDetail = {
  lead: {
    id: "lead-1",
    företag: "Test AB",
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
    status: "new",
    quarantine_until: null,
    callback_at: null,
    callback_reminded_at: null,
    imported_at: null,
    inserted_at: "",
    updated_at: "",
  },
  calls: [],
};

describe("DialerPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    nextLeadMutateMock.mockClear();
    outcomeSubmitMock.mockClear();
    useNextLeadMock.mockReturnValue({
      mutate: nextLeadMutateMock,
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
    });
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("renders tabs", () => {
    render(<DialerPage />, { wrapper: Wrapper });
    expect(screen.getByText("Dialer")).toBeInTheDocument();
    expect(screen.getByText(/Callbacks/)).toBeInTheDocument();
    expect(screen.getByText("Samtalshistorik")).toBeInTheDocument();
  });

  it("renders initial state with next-lead button", () => {
    render(<DialerPage />, { wrapper: Wrapper });
    expect(screen.getByText("Redo att börja ringa?")).toBeInTheDocument();
    expect(screen.getByText("Nästa kund")).toBeInTheDocument();
  });

  it("calls nextLead mutation when button clicked", () => {
    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    expect(nextLeadMutateMock).toHaveBeenCalled();
  });

  it("shows error when nextLead fails", () => {
    useNextLeadMock.mockReturnValue({
      mutate: nextLeadMutateMock,
      isPending: false,
      isError: true,
      error: { message: "No leads left" },
      data: undefined,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    expect(screen.getByText("Kunde inte hämta nästa kund.")).toBeInTheDocument();
  });

  it("shows pending text when fetching next lead", () => {
    useNextLeadMock.mockReturnValue({
      mutate: nextLeadMutateMock,
      isPending: true,
      isError: false,
      error: null,
      data: undefined,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    expect(screen.getByText("Hämtar...")).toBeInTheDocument();
  });

  it("shows loading state when lead detail is loading", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: true });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    expect(screen.getByText("Laddar kundkort")).toBeInTheDocument();
  });

  it("shows loading when lead detail data is not yet available", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    expect(screen.getByText("Laddar kundkort")).toBeInTheDocument();
  });

  it("renders lead detail when lead is loaded", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({
      data: mockLeadDetail,
      isLoading: false,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    // Verify lead is shown in kundinfo
    expect(screen.getAllByText("Test AB").length).toBeGreaterThanOrEqual(1);
    // ActionBar skip button (uses "Hoppa over" without ö)
    expect(screen.getByText("Hoppa over")).toBeInTheDocument();
  });

  it("skip button fires outcome and fetches next lead", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({
      data: mockLeadDetail,
      isLoading: false,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));

    // Skip button is in ActionBar
    fireEvent.click(screen.getByText("Hoppa over"));

    // Skip fires outcome mutation
    expect(outcomeSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "no_answer" }),
      expect.any(Object),
    );
  });

  it("shows fallback error message when no specific error", () => {
    useNextLeadMock.mockReturnValue({
      mutate: nextLeadMutateMock,
      isPending: false,
      isError: true,
      error: null,
      data: undefined,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    expect(screen.getByText("Kunde inte hämta nästa kund.")).toBeInTheDocument();
  });

  it("switches to callbacks tab", () => {
    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/Callbacks/));
    expect(screen.getByText("Inga återuppringningar just nu.")).toBeInTheDocument();
  });

  it("switches to history tab", () => {
    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Samtalshistorik"));
    // History tab shows date picker header
    expect(screen.getAllByText("Samtalshistorik").length).toBeGreaterThanOrEqual(2);
  });
});
