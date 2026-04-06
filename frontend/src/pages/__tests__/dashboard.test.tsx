import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "../dashboard";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const useDashboardMock = vi.fn();
const useLeaderboardMock = vi.fn();

vi.mock("@/api/dashboard", () => ({
  useDashboard: () => useDashboardMock(),
  useLeaderboard: () => useLeaderboardMock(),
}));

vi.mock("@/api/deals", () => ({
  useDeals: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/api/auth", () => ({
  useMe: vi.fn(() => ({ data: { id: "u1", name: "Test User", role: "admin" } })),
}));

vi.mock("@/lib/socket", () => ({
  joinCallsChannel: vi.fn(() => ({ leave: vi.fn() })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    useLeaderboardMock.mockReturnValue({ data: [] });
    useDashboardMock.mockReturnValue({
      data: {
        stats: { total_leads: 200, new: 50, assigned: 30, meeting_booked: 10, quarantine: 5, customer: 3, bad_number: 2 },
        my_stats: { calls_today: 5, total_calls: 100, meetings_today: 2, total_meetings: 50 },
        conversion: { calls_today: 5, meetings_today: 2, rate: 40 },
        goal_progress: [],
      },
      isLoading: false,
    });
  });

  it("renders greeting with user name", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Hej Test")).toBeInTheDocument();
  });

  it("renders stat cards", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Samtal idag")).toBeInTheDocument();
    expect(screen.getByText("Möten idag")).toBeInTheDocument();
    expect(screen.getByText("Konvertering")).toBeInTheDocument();
    expect(screen.getByText("Aktiva deals")).toBeInTheDocument();
  });

  it("renders lead stats", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Totala leads")).toBeInTheDocument();
    expect(screen.getByText("Nya")).toBeInTheDocument();
    expect(screen.getByText("Tilldelade")).toBeInTheDocument();
    expect(screen.getByText("Karantän")).toBeInTheDocument();
  });

  it("renders my stats values", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    // Values appear in stat cards — check they exist somewhere
    expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
  });

  it("shows loading indicators for stats", () => {
    useDashboardMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<DashboardPage />, { wrapper: Wrapper });
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("handles zero values", () => {
    useDashboardMock.mockReturnValue({
      data: {
        stats: { total_leads: 0, new: 0, assigned: 0, meeting_booked: 0, quarantine: 0, customer: 0, bad_number: 0 },
        my_stats: { calls_today: 0, total_calls: 0, meetings_today: 0, total_meetings: 0 },
        conversion: { calls_today: 0, meetings_today: 0, rate: 0 },
        goal_progress: [],
      },
      isLoading: false,
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it("renders date", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    const dateEl = screen.getByText(/\d+ \w+/);
    expect(dateEl).toBeInTheDocument();
  });
});
