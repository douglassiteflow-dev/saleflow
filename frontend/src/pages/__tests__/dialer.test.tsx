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
  useDashboard: vi.fn(() => ({ data: undefined, isLoading: false })),
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
  useUpdateMeeting: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/api/telavox", () => ({
  useTelavoxStatus: vi.fn(() => ({ data: undefined })),
  useDial: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useHangup: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useTelavoxConnect: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useTelavoxDisconnect: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/api/microsoft", () => ({
  useMicrosoftStatus: vi.fn(() => ({ data: { connected: false } })),
  useMicrosoftAuthorize: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useMicrosoftDisconnect: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/api/sessions", () => ({
  useMySessions: vi.fn(() => ({ data: [] })),
  useLogoutAll: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
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

  it("auto-loads next lead on mount", () => {
    render(<DialerPage />, { wrapper: Wrapper });
    // The useEffect auto-fires mutate on mount
    expect(nextLeadMutateMock).toHaveBeenCalled();
  });

  it("shows loading state while fetching next lead on mount", () => {
    render(<DialerPage />, { wrapper: Wrapper });
    // With no currentLeadId and data undefined, shows loader
    expect(screen.getByText(/Hämtar nästa kund/)).toBeInTheDocument();
  });

  it("shows 'no leads' when nextLead returns null", () => {
    useNextLeadMock.mockReturnValue({
      mutate: nextLeadMutateMock,
      isPending: false,
      isError: false,
      error: null,
      data: null,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga fler leads i kön.")).toBeInTheDocument();
    expect(screen.getByText("Försök igen")).toBeInTheDocument();
  });

  it("shows pending state when fetching next lead", () => {
    useNextLeadMock.mockReturnValue({
      mutate: nextLeadMutateMock,
      isPending: true,
      isError: false,
      error: null,
      data: undefined,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Hämtar nästa kund/)).toBeInTheDocument();
  });

  it("shows loading state when lead detail is loading", () => {
    // Simulate auto-load setting currentLeadId
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: true });

    render(<DialerPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar kundkort")).toBeInTheDocument();
  });

  it("shows loading when lead detail data is not yet available", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<DialerPage />, { wrapper: Wrapper });
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
    // Verify lead is shown in kundinfo
    expect(screen.getAllByText("Test AB").length).toBeGreaterThanOrEqual(1);
    // ActionBar skip button (uses "Hoppa över" without ö)
    expect(screen.getByText("Hoppa över")).toBeInTheDocument();
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

    // Skip button is in ActionBar
    fireEvent.click(screen.getByText("Hoppa över"));

    // Skip fires outcome mutation
    expect(outcomeSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "no_answer" }),
      expect.any(Object),
    );
  });

  it("switches to callbacks tab", () => {
    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/Callbacks/));
    expect(screen.getByText("Inga återuppringningar.")).toBeInTheDocument();
  });

  it("switches to history tab", () => {
    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Samtalshistorik"));
    // History tab shows date picker header
    expect(screen.getAllByText("Samtalshistorik").length).toBeGreaterThanOrEqual(2);
  });
});
