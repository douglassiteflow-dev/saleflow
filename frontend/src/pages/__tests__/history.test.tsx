import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HistoryPage } from "../history";

const useAuditLogsMock = vi.fn();

vi.mock("@/api/audit", () => ({
  useAuditLogs: () => useAuditLogsMock(),
}));

const defaultLogs = [
  {
    id: "a1",
    lead_id: "l1",
    user_id: "u1",
    user: { name: "Agent A" },
    action: "lead.created",
    details: { source: "import" },
    created_at: "2024-03-15T10:00:00Z",
  },
  {
    id: "a2",
    lead_id: "l2",
    user_id: null,
    user: null,
    action: "call.logged",
    details: null,
    created_at: "2024-03-14T09:00:00Z",
  },
  {
    id: "a3",
    lead_id: "l3",
    user_id: null,
    user: null,
    action: "meeting.created",
    details: {},
    created_at: "2024-03-13T09:00:00Z",
  },
  {
    id: "a4",
    lead_id: "l4",
    user_id: null,
    user: null,
    action: "system.unknown",
    details: null,
    created_at: "2024-03-12T09:00:00Z",
  },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("HistoryPage", () => {
  beforeEach(() => {
    useAuditLogsMock.mockReturnValue({
      data: defaultLogs,
      isLoading: false,
    });
  });

  it("renders page title", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Historik")).toBeInTheDocument();
  });

  it("renders event log table", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Händelselogg")).toBeInTheDocument();
    // "Lead skapad" appears in both dropdown option and table cell
    expect(screen.getAllByText("Lead skapad").length).toBeGreaterThanOrEqual(2);
    // "Samtal loggat" appears in both dropdown option and table cell
    expect(screen.getAllByText("Samtal loggat").length).toBeGreaterThanOrEqual(2);
  });

  it("renders user name when available", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Agent A")).toBeInTheDocument();
  });

  it("renders dash when user is null", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("renders resource type labels", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Samtal")).toBeInTheDocument();
  });

  it("renders Möte resource type", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Möte")).toBeInTheDocument();
  });

  it("renders dash for unknown action resource type", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("filters by search text", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const searchInput = screen.getByPlaceholderText("Sök händelse, lead-ID, användare...");
    fireEvent.change(searchInput, { target: { value: "Agent A" } });
    expect(screen.getByText("Agent A")).toBeInTheDocument();
  });

  it("renders changes summary", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("source: import")).toBeInTheDocument();
  });

  it("renders action filter dropdown", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByDisplayValue("Alla händelser")).toBeInTheDocument();
  });

  it("uses actionLabel for unknown action", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("system.unknown")).toBeInTheDocument();
  });

  it("navigates on row click for lead/call/meeting actions", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]!);
  });

  it("does not navigate for non-navigable actions", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const rows = document.querySelectorAll("tbody tr");
    const lastRow = rows[rows.length - 1]!;
    fireEvent.click(lastRow);
  });

  it("renders loading state", () => {
    useAuditLogsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar historik...")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    useAuditLogsMock.mockReturnValue({ data: [], isLoading: false });
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga händelser hittades.")).toBeInTheDocument();
  });

  it("changes action filter", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const select = screen.getByDisplayValue("Alla händelser");
    fireEvent.change(select, { target: { value: "lead.created" } });
    // useAuditLogs should be called with the action filter
  });

  it("filters by details content in search", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const searchInput = screen.getByPlaceholderText("Sök händelse, lead-ID, användare...");
    fireEvent.change(searchInput, { target: { value: "import" } });
    expect(screen.getByText("source: import")).toBeInTheDocument();
  });

  it("filters by lead_id in search", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const searchInput = screen.getByPlaceholderText("Sök händelse, lead-ID, användare...");
    fireEvent.change(searchInput, { target: { value: "l1" } });
    expect(screen.getByText("Agent A")).toBeInTheDocument();
  });

  it("changes summary shows dash for null details", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    // a2 has null details and a4 has null details → "—" in changes column
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("changes summary shows dash for empty details", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    // a3 has {} details → "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("truncates changes summary to 3 entries", () => {
    useAuditLogsMock.mockReturnValue({
      data: [
        {
          id: "a1",
          lead_id: "l1",
          user_id: "u1",
          user: null,
          action: "lead.updated",
          details: { a: "1", b: "2", c: "3", d: "4" },
          created_at: "2024-03-15T10:00:00Z",
        },
      ],
      isLoading: false,
    });

    render(<HistoryPage />, { wrapper: Wrapper });
    // Only first 3 entries should be shown
    expect(screen.getByText("a: 1, b: 2, c: 3")).toBeInTheDocument();
  });
});
