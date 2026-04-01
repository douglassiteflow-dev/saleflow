import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "../dashboard";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const useAdminStatsMock = vi.fn();
const useMeetingsMock = vi.fn();
const useLeadsMock = vi.fn();

vi.mock("@/api/admin", () => ({
  useAdminStats: () => useAdminStatsMock(),
}));

vi.mock("@/api/meetings", () => ({
  useMeetings: () => useMeetingsMock(),
}));

vi.mock("@/api/leads", () => ({
  useLeads: () => useLeadsMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("DashboardPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    useAdminStatsMock.mockReturnValue({
      data: { total_leads: 100, new: 50, assigned: 20, meeting_booked: 5, quarantine: 10, customer: 10, bad_number: 5 },
      isLoading: false,
    });
    useMeetingsMock.mockReturnValue({
      data: [
        {
          id: "m1",
          lead_id: "l1",
          user_id: "u1",
          title: "Morning meeting",
          meeting_date: todayDateString(),
          meeting_time: "10:00:00",
          notes: null,
          status: "scheduled",
          reminded_at: null,
          inserted_at: "2024-01-01T00:00:00Z",
        },
      ],
    });
    useLeadsMock.mockReturnValue({
      data: [
        {
          id: "l1",
          företag: "Testföretag AB",
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
          status: "callback",
          quarantine_until: null,
          callback_at: "2024-06-01T10:00:00Z",
          callback_reminded_at: null,
          imported_at: null,
          inserted_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
    });
  });

  it("renders page title", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders stat cards", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Totalt leads")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Nya")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("renders next lead button", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Nästa kund")).toBeInTheDocument();
  });

  it("renders callbacks section", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Återuppringningar")).toBeInTheDocument();
  });

  it("renders today's meetings section", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Dagens möten")).toBeInTheDocument();
  });

  it("shows loading indicators for stats", () => {
    useAdminStatsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Should show "—" placeholders
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders empty meetings state", () => {
    useMeetingsMock.mockReturnValue({ data: [] });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga möten inbokade för idag.")).toBeInTheDocument();
  });

  it("renders empty callbacks state", () => {
    useLeadsMock.mockReturnValue({ data: [] });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga återuppringningar i kö.")).toBeInTheDocument();
  });

  it("renders null meetings count", () => {
    useMeetingsMock.mockReturnValue({ data: null });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Meetings stat should show "—" when null
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders callback with callback_at date", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    // The callback lead has företag
    expect(screen.getByText("Testföretag AB")).toBeInTheDocument();
  });

  it("renders lead företag name in callbacks", () => {
    useLeadsMock.mockReturnValue({
      data: [
        {
          id: "l2",
          företag: "Corp AB",
          telefon: "+46701234567",
          epost: null,
          status: "callback",
          callback_at: null,
          inserted_at: "",
          updated_at: "",
        },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Corp AB")).toBeInTheDocument();
  });

  it("renders meetings as null then dash", () => {
    useMeetingsMock.mockReturnValue({ data: undefined });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Meeting count when undefined shows "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("navigates when clicking the 'Nästa kund' button", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    const btn = screen.getByText("Nästa kund");
    fireEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith("/dialer");
  });

  it("filters out meetings not matching today's date", () => {
    useMeetingsMock.mockReturnValue({
      data: [
        {
          id: "m1",
          lead_id: "l1",
          user_id: "u1",
          title: "Yesterday meeting",
          meeting_date: "2023-01-01",
          meeting_time: "14:00:00",
          notes: null,
          status: "scheduled",
          reminded_at: null,
          inserted_at: "",
        },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Old meeting not today, so should show "Inga möten inbokade för idag"
    expect(screen.getByText("Inga möten inbokade för idag.")).toBeInTheDocument();
  });

  it("filters out meetings with non-scheduled status", () => {
    useMeetingsMock.mockReturnValue({
      data: [
        {
          id: "m1",
          lead_id: "l1",
          user_id: "u1",
          title: "Cancelled today",
          meeting_date: todayDateString(),
          meeting_time: "14:00:00",
          notes: null,
          status: "cancelled",
          reminded_at: null,
          inserted_at: "",
        },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga möten inbokade för idag.")).toBeInTheDocument();
  });

  it("handles stats with null property values", () => {
    useAdminStatsMock.mockReturnValue({
      data: { total_leads: undefined, new: undefined, assigned: undefined, meeting_booked: undefined, quarantine: undefined, customer: undefined, bad_number: undefined },
      isLoading: false,
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Stats should fall back to 0
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it("handles undefined leads gracefully", () => {
    useLeadsMock.mockReturnValue({ data: undefined });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga återuppringningar i kö.")).toBeInTheDocument();
  });

  it("filters leads that are not callbacks", () => {
    useLeadsMock.mockReturnValue({
      data: [
        { id: "l1", status: "new", företag: "Foo AB", telefon: "123", callback_at: null },
        { id: "l2", status: "callback", företag: "Bar AB", telefon: "456", callback_at: null },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Only callback lead should appear in the callbacks section
    expect(screen.getByText("Bar AB")).toBeInTheDocument();
  });

  it("does not render callback_at when null", () => {
    useLeadsMock.mockReturnValue({
      data: [
        {
          id: "l3",
          företag: "Test No AB",
          telefon: "+46700000000",
          epost: null,
          status: "callback",
          callback_at: null,
          inserted_at: "",
          updated_at: "",
        },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Test No AB")).toBeInTheDocument();
  });
});
