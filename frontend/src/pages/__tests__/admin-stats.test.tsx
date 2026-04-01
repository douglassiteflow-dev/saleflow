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
      data: { total_leads: 100, new: 50, assigned: 20, meeting_booked: 8, quarantine: 10, customer: 7, bad_number: 5 },
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
    expect(screen.getByText("Totalt leads")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Möten bokade")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Kunder")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders lead status breakdown", () => {
    render(<AdminStatsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Leads per status")).toBeInTheDocument();
    // "Nya" appears in both stat card label and status breakdown
    expect(screen.getAllByText("Nya").length).toBeGreaterThanOrEqual(1);
  });

  it("displays count and percentage for statuses", () => {
    render(<AdminStatsPage />, { wrapper: Wrapper });
    // Find the "Nya" (new) row in the status breakdown section
    const nyaLabels = screen.getAllByText("Nya");
    // The one inside the breakdown section (not the stat card)
    const breakdownNya = nyaLabels.find((el) => el.closest(".space-y-1\\.5"));
    const nyaRow = breakdownNya!.closest(".space-y-1\\.5")!;
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
    expect(screen.getAllByText("Nya").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Tilldelade")).toBeInTheDocument();
    expect(screen.getByText("Återuppringning")).toBeInTheDocument();
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Karantän")).toBeInTheDocument();
    expect(screen.getByText("Fel nummer")).toBeInTheDocument();
    expect(screen.getByText("Kund")).toBeInTheDocument();
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
    expect(zeroCounts.length).toBeGreaterThanOrEqual(7);
  });

  it("does not show percentages when total is 0", () => {
    useLeadsMock.mockReturnValue({ data: [], isLoading: false });
    render(<AdminStatsPage />, { wrapper: Wrapper });
    // No "(x%)" elements should be present
    expect(screen.queryByText(/\(\d+\.\d+%\)/)).not.toBeInTheDocument();
  });
});
