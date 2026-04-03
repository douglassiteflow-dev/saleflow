import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HistoryPage } from "../history";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const useCallHistoryMock = vi.fn();
vi.mock("@/api/calls", () => ({
  useCallHistory: (...args: unknown[]) => useCallHistoryMock(...args),
}));

const useMeMock = vi.fn();
vi.mock("@/api/auth", () => ({
  useMe: () => useMeMock(),
}));

const defaultCalls = [
  {
    id: "c1",
    caller: "+46701234567",
    callee: "+46709999999",
    duration: 95,
    direction: "outgoing",
    received_at: "2024-03-15T10:00:00Z",
    user_id: "u1",
    user_name: "Anna B",
    lead_id: "l1",
    lead_name: "Acme AB",
    has_recording: false,
    outcome: "meeting_booked",
    notes: null,
  },
  {
    id: "c2",
    caller: "+46701234567",
    callee: "+46708888888",
    duration: 0,
    direction: "outgoing",
    received_at: "2024-03-15T09:30:00Z",
    user_id: "u1",
    user_name: "Anna B",
    lead_id: "l2",
    lead_name: "Beta Corp",
    has_recording: false,
    outcome: "no_answer",
    notes: null,
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
    navigateMock.mockClear();
    useMeMock.mockReturnValue({ data: { role: "agent" } });
    useCallHistoryMock.mockReturnValue({
      data: defaultCalls,
      isLoading: false,
    });
  });

  it("renders 'Samtalshistorik' heading", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Samtalshistorik")).toBeInTheDocument();
  });

  it("renders call data in table (företag, telefon, utfall badge)", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Acme AB")).toBeInTheDocument();
    expect(screen.getByText("+46709999999")).toBeInTheDocument();
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Beta Corp")).toBeInTheDocument();
    expect(screen.getByText("+46708888888")).toBeInTheDocument();
    expect(screen.getByText("Ej svar")).toBeInTheDocument();
  });

  it("renders empty state when no calls", () => {
    useCallHistoryMock.mockReturnValue({ data: [], isLoading: false });
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Inga samtal/)).toBeInTheDocument();
  });

  it("renders loading state", () => {
    useCallHistoryMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar samtal...")).toBeInTheDocument();
  });

  it("renders date picker", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const datePicker = document.querySelector('input[type="date"]');
    expect(datePicker).toBeInTheDocument();
  });

  it("navigates to lead on row click", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(0);
    rows[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(navigateMock).toHaveBeenCalledWith("/leads/l1");
  });

  it("shows Agent column for admin users", () => {
    useMeMock.mockReturnValue({ data: { role: "admin" } });
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getAllByText("Anna B").length).toBe(2);
  });

  it("hides Agent column for non-admin users", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    expect(screen.queryByText("Agent")).not.toBeInTheDocument();
  });

  it("formats duration correctly", () => {
    render(<HistoryPage />, { wrapper: Wrapper });
    // 95 seconds = 1m 35s
    expect(screen.getByText("1m 35s")).toBeInTheDocument();
  });
});
