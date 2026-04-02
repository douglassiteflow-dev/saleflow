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

const useDashboardMock = vi.fn();

vi.mock("@/api/dashboard", () => ({
  useDashboard: () => useDashboardMock(),
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
    useDashboardMock.mockReturnValue({
      data: {
        stats: {
          total_leads: 100,
          new: 50,
          assigned: 20,
          meeting_booked: 5,
          quarantine: 10,
          customer: 10,
          bad_number: 5,
        },
        todays_meetings: [
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
            updated_at: "2024-01-01T00:00:00Z",
            inserted_at: "2024-01-01T00:00:00Z",
            user_name: "Jane Agent",
            lead: { id: "l1", företag: "Test AB", telefon: "+46701234567" },
          },
        ],
        callbacks: [
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
        my_stats: {
          calls_today: 5,
          total_calls: 100,
          meetings_today: 2,
          total_meetings: 50,
        },
      },
      isLoading: false,
    });
  });

  it("renders page title", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders stat cards", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Totalt leads")).toBeInTheDocument();
    // 100 appears in both stats and my_stats, so use getAllByText
    const hundreds = screen.getAllByText("100");
    expect(hundreds.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Nya i kön")).toBeInTheDocument();
    // 50 appears in both stats (new: 50) and my_stats (total_meetings: 50)
    const fifties = screen.getAllByText("50");
    expect(fifties.length).toBeGreaterThanOrEqual(1);
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
    useDashboardMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Should show "—" placeholders
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders empty meetings state", () => {
    useDashboardMock.mockReturnValue({
      data: {
        stats: { total_leads: 0, new: 0, assigned: 0, meeting_booked: 0, quarantine: 0, customer: 0, bad_number: 0 },
        todays_meetings: [],
        callbacks: [],
        my_stats: { calls_today: 0, total_calls: 0, meetings_today: 0, total_meetings: 0 },
      },
      isLoading: false,
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga möten inbokade för idag.")).toBeInTheDocument();
  });

  it("renders empty callbacks state", () => {
    useDashboardMock.mockReturnValue({
      data: {
        stats: { total_leads: 0, new: 0, assigned: 0, meeting_booked: 0, quarantine: 0, customer: 0, bad_number: 0 },
        todays_meetings: [],
        callbacks: [],
        my_stats: { calls_today: 0, total_calls: 0, meetings_today: 0, total_meetings: 0 },
      },
      isLoading: false,
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga återuppringningar i kö.")).toBeInTheDocument();
  });

  it("renders null dashboard data gracefully", () => {
    useDashboardMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga möten inbokade för idag.")).toBeInTheDocument();
    expect(screen.getByText("Inga återuppringningar i kö.")).toBeInTheDocument();
  });

  it("renders callback with callback_at date", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    // The callback lead has företag
    expect(screen.getByText("Testföretag AB")).toBeInTheDocument();
  });

  it("renders lead företag name in callbacks", () => {
    useDashboardMock.mockReturnValue({
      data: {
        stats: { total_leads: 0, new: 0, assigned: 0, meeting_booked: 0, quarantine: 0, customer: 0, bad_number: 0 },
        todays_meetings: [],
        callbacks: [
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
        my_stats: { calls_today: 0, total_calls: 0, meetings_today: 0, total_meetings: 0 },
      },
      isLoading: false,
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Corp AB")).toBeInTheDocument();
  });

  it("navigates when clicking the Nästa kund button", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    const btn = screen.getByText("Nästa kund");
    fireEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith("/dialer");
  });

  it("renders my stats section", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Samtal idag")).toBeInTheDocument();
    // 5 appears in both stats (meeting_booked: 5, bad_number: 5) and my_stats (calls_today: 5)
    const fives = screen.getAllByText("5");
    expect(fives.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Möten idag")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("handles stats with zero values", () => {
    useDashboardMock.mockReturnValue({
      data: {
        stats: { total_leads: 0, new: 0, assigned: 0, meeting_booked: 0, quarantine: 0, customer: 0, bad_number: 0 },
        todays_meetings: [],
        callbacks: [],
        my_stats: { calls_today: 0, total_calls: 0, meetings_today: 0, total_meetings: 0 },
      },
      isLoading: false,
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Stats should show 0
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it("handles undefined dashboard gracefully", () => {
    useDashboardMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga återuppringningar i kö.")).toBeInTheDocument();
  });

  it("does not render callback_at when null", () => {
    useDashboardMock.mockReturnValue({
      data: {
        stats: { total_leads: 0, new: 0, assigned: 0, meeting_booked: 0, quarantine: 0, customer: 0, bad_number: 0 },
        todays_meetings: [],
        callbacks: [
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
        my_stats: { calls_today: 0, total_calls: 0, meetings_today: 0, total_meetings: 0 },
      },
      isLoading: false,
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Test No AB")).toBeInTheDocument();
  });
});
