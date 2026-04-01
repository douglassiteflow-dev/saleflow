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

describe("DashboardPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    useAdminStatsMock.mockReturnValue({
      data: { calls_today: 10, leads_remaining: 50, meetings_booked: 5, conversion_rate: 0.2 },
      isLoading: false,
    });
    useMeetingsMock.mockReturnValue({
      data: [
        {
          id: "m1",
          lead_id: "l1",
          user_id: "u1",
          title: "Morning meeting",
          scheduled_at: new Date().toISOString(),
          notes: null,
          status: "scheduled",
          lead: { company: "Acme", first_name: "A", last_name: "B" },
          created_at: "",
          updated_at: "",
        },
      ],
    });
    useLeadsMock.mockReturnValue({
      data: [
        {
          id: "l1",
          first_name: "Anna",
          last_name: "S",
          company: null,
          phone: "+46701234567",
          email: null,
          status: "callback",
          assigned_to: null,
          notes: null,
          priority: 1,
          callback_at: "2024-06-01T10:00:00Z",
          do_not_call: false,
          list_name: null,
          created_at: "",
          updated_at: "",
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
    expect(screen.getByText("Samtal idag")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Leads kvar")).toBeInTheDocument();
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
    // The callback lead has callback_at so it should be formatted
    expect(screen.getByText("Anna S")).toBeInTheDocument();
  });

  it("renders lead company name in callbacks if present", () => {
    useLeadsMock.mockReturnValue({
      data: [
        {
          id: "l2",
          first_name: "B",
          last_name: "C",
          company: "Corp AB",
          phone: "+46701234567",
          email: null,
          status: "callback",
          assigned_to: null,
          notes: null,
          priority: 1,
          callback_at: null,
          do_not_call: false,
          list_name: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Corp AB")).toBeInTheDocument();
  });

  it("renders meeting lead name fallback when no company", () => {
    useMeetingsMock.mockReturnValue({
      data: [
        {
          id: "m2",
          lead_id: "l2",
          user_id: "u1",
          title: "Afternoon meeting",
          scheduled_at: new Date().toISOString(),
          notes: null,
          status: "scheduled",
          lead: { company: null, first_name: "Foo", last_name: "Bar" },
          created_at: "",
          updated_at: "",
        },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Foo Bar")).toBeInTheDocument();
  });

  it("renders meetings as null → dash", () => {
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
          scheduled_at: "2023-01-01T14:00:00Z",
          notes: null,
          status: "scheduled",
          lead: null,
          created_at: "",
          updated_at: "",
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
          scheduled_at: new Date().toISOString(),
          notes: null,
          status: "cancelled",
          lead: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga möten inbokade för idag.")).toBeInTheDocument();
  });

  it("handles stats with null property values", () => {
    useAdminStatsMock.mockReturnValue({
      data: { calls_today: undefined, leads_remaining: undefined, meetings_booked: undefined, conversion_rate: undefined },
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
        { id: "l1", status: "new", first_name: "A", last_name: "B", company: null, phone: "123", callback_at: null },
        { id: "l2", status: "callback", first_name: "C", last_name: "D", company: null, phone: "456", callback_at: null },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    // Only callback lead should appear in the callbacks section
    expect(screen.getByText("C D")).toBeInTheDocument();
  });

  it("does not render callback_at when null", () => {
    useLeadsMock.mockReturnValue({
      data: [
        {
          id: "l3",
          first_name: "Test",
          last_name: "No",
          company: null,
          phone: "+46700000000",
          email: null,
          status: "callback",
          assigned_to: null,
          notes: null,
          priority: 1,
          callback_at: null,
          do_not_call: false,
          list_name: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText("Test No")).toBeInTheDocument();
  });
});
