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
    status: "new",
    quarantine_until: null,
    callback_at: null,
    callback_reminded_at: null,
    imported_at: null,
    inserted_at: "",
    updated_at: "",
  },
  calls: [],
  audit_logs: [],
};

describe("DialerPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    useNextLeadMock.mockReturnValue({
      mutate: nextLeadMutateMock,
      isPending: false,
      isError: false,
      error: null,
    });
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: false });
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
    expect(screen.getByText("Laddar kund...")).toBeInTheDocument();
  });

  it("shows loading when lead detail data is not yet available", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    expect(screen.getByText("Laddar kund...")).toBeInTheDocument();
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
    // Verify lead is shown
    expect(screen.getAllByText("Test AB").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Hoppa över")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
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

    // Now we should see lead detail with Skip button
    fireEvent.click(screen.getByText("Hoppa över"));

    // Skip fires outcome mutation without awaiting
    expect(outcomeSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "no_answer" }),
    );
    // And immediately fetches next lead
    expect(nextLeadMutateMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("fetches next lead after outcome is submitted", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    // Make outcome submit trigger onSuccess
    outcomeSubmitMock.mockImplementation((_: unknown, opts: { onSuccess?: () => void }) => {
      opts.onSuccess?.();
    });
    useLeadDetailMock.mockReturnValue({
      data: mockLeadDetail,
      isLoading: false,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));

    // Now submit an outcome
    fireEvent.click(screen.getByText("Svarar ej"));
    fireEvent.click(screen.getByText("Bekräfta: Svarar ej"));

    // handleOutcomeSubmitted should call handleNextLead again
    expect(nextLeadMutateMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("navigates to dashboard when Dashboard button is clicked", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({
      data: mockLeadDetail,
      isLoading: false,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    // Click the dashboard button
    fireEvent.click(screen.getByText("Dashboard"));
    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows fallback error message when no specific error", () => {
    useNextLeadMock.mockReturnValue({
      mutate: nextLeadMutateMock,
      isPending: false,
      isError: true,
      error: null,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    expect(screen.getByText("Kunde inte hämta nästa kund.")).toBeInTheDocument();
  });
});
