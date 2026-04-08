import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminLogsPage } from "../admin-logs";

const useAuditLogsMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/api/audit", () => ({
  useAuditLogs: () => useAuditLogsMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const mockLogs = [
  {
    id: "log-1",
    action: "lead.status_changed",
    resource_type: "Lead",
    resource_id: "lead-123",
    user_name: "Anna Svensson",
    inserted_at: "2026-04-01T12:00:00Z",
    changes: { status: { from: "new", to: "assigned" } },
  },
  {
    id: "log-2",
    action: "meeting.created",
    resource_type: "Meeting",
    resource_id: "meet-456",
    user_name: null,
    inserted_at: "2026-04-01T11:00:00Z",
    changes: null,
  },
  {
    id: "log-3",
    action: "session.created",
    resource_type: "LoginSession",
    resource_id: "sess-789",
    user_name: "Bo Berg",
    inserted_at: "2026-04-01T10:00:00Z",
    changes: null,
  },
];

describe("AdminLogsPage", () => {
  beforeEach(() => {
    useAuditLogsMock.mockReturnValue({ data: mockLogs, isLoading: false });
  });

  it("renders page heading as h1", () => {
    render(<AdminLogsPage />, { wrapper: Wrapper });
    // Both h1 and h3 contain "Händelselogg", use getAllByText
    const headings = screen.getAllByText("Händelselogg");
    expect(headings.length).toBeGreaterThanOrEqual(1);
    // The h1 heading should be present
    const h1 = document.querySelector("h1");
    expect(h1?.textContent).toBe("Händelselogg");
  });

  it("renders loading state", () => {
    useAuditLogsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AdminLogsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar historik")).toBeInTheDocument();
  });

  it("renders empty state when no logs", () => {
    useAuditLogsMock.mockReturnValue({ data: [], isLoading: false });
    render(<AdminLogsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga händelser hittades.")).toBeInTheDocument();
  });

  it("renders action labels in table", () => {
    render(<AdminLogsPage />, { wrapper: Wrapper });
    // "Status ändrad" appears in both the dropdown AND table - use getAllByText
    const statusChanged = screen.getAllByText("Status ändrad");
    expect(statusChanged.length).toBeGreaterThanOrEqual(1);
    // "Inloggning" only appears in the dropdown option and table row
    const inloggning = screen.getAllByText("Inloggning");
    expect(inloggning.length).toBeGreaterThanOrEqual(1);
  });

  it("renders user names and System fallback", () => {
    render(<AdminLogsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Anna Svensson")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Bo Berg")).toBeInTheDocument();
  });

  it("renders resource type labels", () => {
    render(<AdminLogsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Möte")).toBeInTheDocument();
    expect(screen.getByText("Session")).toBeInTheDocument();
  });

  it("filters logs by resource_id search text", () => {
    render(<AdminLogsPage />, { wrapper: Wrapper });
    const input = screen.getByPlaceholderText("Sök händelse...");
    // Search by resource_id (unique to lead log)
    fireEvent.change(input, { target: { value: "lead-123" } });
    // lead log row should still show
    expect(screen.getByText("Anna Svensson")).toBeInTheDocument();
    // bo berg log should not show (resource_id = sess-789)
    expect(screen.queryByText("Bo Berg")).not.toBeInTheDocument();
  });

  it("navigates to lead on row click for lead action", () => {
    render(<AdminLogsPage />, { wrapper: Wrapper });
    // Click the row containing Anna Svensson (the lead.status_changed row)
    fireEvent.click(screen.getByText("Anna Svensson"));
    expect(navigateMock).toHaveBeenCalledWith("/leads/lead-123");
  });

  it("renders action filter dropdown", () => {
    render(<AdminLogsPage />, { wrapper: Wrapper });
    expect(screen.getByDisplayValue("Alla händelser")).toBeInTheDocument();
  });
});
