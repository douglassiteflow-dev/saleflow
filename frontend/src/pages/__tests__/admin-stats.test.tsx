import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminStatsPage } from "../admin-stats";

const useAdminStatsMock = vi.fn();
const useLeadsMock = vi.fn();

vi.mock("@/api/admin", () => ({
  useAdminStats: () => useAdminStatsMock(),
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

describe("AdminStatsPage", () => {
  beforeEach(() => {
    useAdminStatsMock.mockReturnValue({
      data: { calls_today: 15, leads_remaining: 100, meetings_booked: 8, conversion_rate: 0.12 },
      isLoading: false,
    });
    useLeadsMock.mockReturnValue({
      data: [
        { id: "1", status: "new" },
        { id: "2", status: "new" },
        { id: "3", status: "meeting_booked" },
        { id: "4", status: "callback" },
      ],
      isLoading: false,
    });
  });

  it("renders page title", () => {
    render(<AdminStatsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Statistik")).toBeInTheDocument();
  });

  it("renders stat cards", () => {
    render(<AdminStatsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Samtal idag")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("Leads kvar")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Möten bokade")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Konvertering")).toBeInTheDocument();
    expect(screen.getByText("12.0%")).toBeInTheDocument();
  });

  it("renders lead status breakdown", () => {
    render(<AdminStatsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Leads per status")).toBeInTheDocument();
    expect(screen.getByText("Nya")).toBeInTheDocument();
  });

  it("displays count and percentage for statuses", () => {
    render(<AdminStatsPage />, { wrapper: Wrapper });
    // Find the "Nya" (new) row and verify count within it
    const nyaLabel = screen.getByText("Nya");
    const nyaRow = nyaLabel.closest(".space-y-1\\.5")!;
    const nyaScope = within(nyaRow as HTMLElement);
    expect(nyaScope.getByText("2")).toBeInTheDocument();
    expect(nyaScope.getByText("(50.0%)")).toBeInTheDocument();
  });

  it("shows zero count for missing statuses", () => {
    render(<AdminStatsPage />, { wrapper: Wrapper });
    const zeroCounts = screen.getAllByText("0");
    expect(zeroCounts.length).toBeGreaterThan(0);
  });

  it("shows loading state for stats", () => {
    useAdminStatsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AdminStatsPage />, { wrapper: Wrapper });
    // Stat cards should show "—" — exactly 4 stat cards
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(4);
  });

  it("shows loading state for leads breakdown", () => {
    useLeadsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AdminStatsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar statistik...")).toBeInTheDocument();
  });

  it("renders all status labels", () => {
    render(<AdminStatsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Nya")).toBeInTheDocument();
    expect(screen.getByText("Tilldelade")).toBeInTheDocument();
    expect(screen.getByText("Återuppringning")).toBeInTheDocument();
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Karantän")).toBeInTheDocument();
    expect(screen.getByText("Fel nummer")).toBeInTheDocument();
    expect(screen.getByText("Kund")).toBeInTheDocument();
    expect(screen.getByText("Inte intresserad")).toBeInTheDocument();
  });

  it("handles null stats data", () => {
    useAdminStatsMock.mockReturnValue({ data: null, isLoading: false });
    render(<AdminStatsPage />, { wrapper: Wrapper });
    // Should still render stat cards with fallback 0 values
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThan(0);
  });

  it("handles null leads data", () => {
    useLeadsMock.mockReturnValue({ data: null, isLoading: false });
    render(<AdminStatsPage />, { wrapper: Wrapper });
    // All statuses show 0
    const zeroCounts = screen.getAllByText("0");
    expect(zeroCounts.length).toBeGreaterThanOrEqual(8);
  });

  it("does not show percentages when total is 0", () => {
    useLeadsMock.mockReturnValue({ data: [], isLoading: false });
    render(<AdminStatsPage />, { wrapper: Wrapper });
    // No "(x%)" elements should be present
    expect(screen.queryByText(/\(\d+\.\d+%\)/)).not.toBeInTheDocument();
  });
});
