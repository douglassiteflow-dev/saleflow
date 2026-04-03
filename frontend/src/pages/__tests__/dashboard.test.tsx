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
const useLeaderboardMock = vi.fn();

vi.mock("@/api/dashboard", () => ({
  useDashboard: () => useDashboardMock(),
  useLeaderboard: () => useLeaderboardMock(),
}));

vi.mock("@/api/auth", () => ({
  useMe: vi.fn(() => ({ data: { id: "u1", name: "Test User", role: "agent" } })),
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
    navigateMock.mockClear();
    useLeaderboardMock.mockReturnValue({ data: [] });
    useDashboardMock.mockReturnValue({
      data: {
        my_stats: {
          calls_today: 5,
          total_calls: 100,
          meetings_today: 2,
          total_meetings: 50,
        },
        conversion: {
          calls_today: 5,
          meetings_today: 2,
          rate: 40,
        },
        goal_progress: [],
      },
      isLoading: false,
    });
  });

  it("renders greeting with user name", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Hej Test")).toBeInTheDocument();
  });

  it("renders next lead button", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Nästa kund/)).toBeInTheDocument();
  });

  it("renders stat cards", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Samtal idag")).toBeInTheDocument();
    expect(screen.getByText("Möten idag")).toBeInTheDocument();
    expect(screen.getByText("Konvertering")).toBeInTheDocument();
  });

  it("renders my stats values", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows loading indicators for stats", () => {
    useDashboardMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<DashboardPage />, { wrapper: Wrapper });
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("navigates when clicking the Nästa kund button", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    const btn = screen.getByText(/Nästa kund/);
    fireEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith("/dialer");
  });

  it("handles stats with zero values", () => {
    useDashboardMock.mockReturnValue({
      data: {
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

  it("handles undefined dashboard gracefully", () => {
    useDashboardMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Stats should show fallback 0
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it("renders conversion rate with suffix", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("renders date", () => {
    render(<DashboardPage />, { wrapper: Wrapper });
    // Swedish date format is rendered
    const dateEl = screen.getByText(/\d+ \w+/);
    expect(dateEl).toBeInTheDocument();
  });
});
