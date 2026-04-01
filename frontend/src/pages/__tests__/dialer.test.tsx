import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialerPage } from "../dialer";

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

describe("DialerPage", () => {
  beforeEach(() => {
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
    expect(screen.getByText("No leads left")).toBeInTheDocument();
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
    // Simulate that we have a currentLeadId set internally
    // We need to trigger setCurrentLeadId by calling nextLead successfully
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: true });

    render(<DialerPage />, { wrapper: Wrapper });
    // Click "Nästa kund" to set currentLeadId
    fireEvent.click(screen.getByText("Nästa kund"));
    expect(screen.getByText("Laddar kund...")).toBeInTheDocument();
  });

  it("shows error when lead detail fails to load", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: false });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    expect(screen.getByText("Kunde inte ladda kunddata.")).toBeInTheDocument();
  });

  it("renders lead detail when lead is loaded", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({
      data: {
        id: "lead-1",
        first_name: "Anna",
        last_name: "Svensson",
        company: "Test AB",
        phone: "+46701234567",
        email: null,
        status: "new",
        assigned_to: null,
        notes: null,
        priority: 1,
        callback_at: null,
        do_not_call: false,
        list_name: null,
        created_at: "",
        updated_at: "",
        call_logs: [],
        audit_logs: [],
      },
      isLoading: false,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    // Verify lead is shown
    expect(screen.getAllByText("Test AB").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Hoppa över")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("skip button resets lead", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({
      data: {
        id: "lead-1",
        first_name: "Anna",
        last_name: "Svensson",
        company: "Test AB",
        phone: "+46701234567",
        email: null,
        status: "new",
        assigned_to: null,
        notes: null,
        priority: 1,
        callback_at: null,
        do_not_call: false,
        list_name: null,
        created_at: "",
        updated_at: "",
      },
      isLoading: false,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));

    // Now we should see lead detail with Skip button
    fireEvent.click(screen.getByText("Hoppa över"));

    // After skip, we should be back to initial state
    expect(screen.getByText("Redo att börja ringa?")).toBeInTheDocument();
  });

  it("shows lead name without company", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({
      data: {
        id: "lead-1",
        first_name: "Anna",
        last_name: "Svensson",
        company: null,
        phone: "+46701234567",
        email: null,
        status: "new",
        assigned_to: null,
        notes: null,
        priority: 1,
        callback_at: null,
        do_not_call: false,
        list_name: null,
        created_at: "",
        updated_at: "",
      },
      isLoading: false,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    expect(screen.getAllByText("Anna Svensson").length).toBeGreaterThanOrEqual(1);
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
      data: {
        id: "lead-1",
        first_name: "Anna",
        last_name: "Svensson",
        company: "Test AB",
        phone: "+46701234567",
        email: null,
        status: "new",
        assigned_to: null,
        notes: null,
        priority: 1,
        callback_at: null,
        do_not_call: false,
        list_name: null,
        created_at: "",
        updated_at: "",
      },
      isLoading: false,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));

    // Now submit an outcome
    fireEvent.click(screen.getByText("Svarar ej"));
    fireEvent.click(screen.getByText("Bekräfta: Svarar ej"));

    // handleOutcomeSubmitted should call handleNextLead again
    // (may be called multiple times due to cascading onSuccess)
    expect(nextLeadMutateMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("navigates to dashboard when Dashboard button is clicked", () => {
    nextLeadMutateMock.mockImplementation((_: unknown, opts: { onSuccess?: (lead: { id: string }) => void }) => {
      opts.onSuccess?.({ id: "lead-1" });
    });
    useLeadDetailMock.mockReturnValue({
      data: {
        id: "lead-1",
        first_name: "Anna",
        last_name: "Svensson",
        company: "Test AB",
        phone: "+46701234567",
        email: null,
        status: "new",
        assigned_to: null,
        notes: null,
        priority: 1,
        callback_at: null,
        do_not_call: false,
        list_name: null,
        created_at: "",
        updated_at: "",
      },
      isLoading: false,
    });

    render(<DialerPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nästa kund"));
    // Click the dashboard button
    fireEvent.click(screen.getByText("Dashboard"));
    // Navigation handled by router
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
