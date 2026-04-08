import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminListsPage } from "../admin-lists";

const useLeadListsMock = vi.fn();
const useAdminUsersMock = vi.fn();
const useUpdateListMock = vi.fn();
const useLeadListAgentsMock = vi.fn();
const useLeadListLeadsMock = vi.fn();
const useAssignAgentMock = vi.fn();
const useRemoveAgentMock = vi.fn();
const updateMutateMock = vi.fn();

vi.mock("@/api/lists", () => ({
  useLeadLists: () => useLeadListsMock(),
  useLeadListLeads: () => useLeadListLeadsMock(),
  useLeadListAgents: () => useLeadListAgentsMock(),
  useAssignAgent: () => useAssignAgentMock(),
  useRemoveAgent: () => useRemoveAgentMock(),
  useUpdateList: () => useUpdateListMock(),
}));

vi.mock("@/api/admin", () => ({
  useAdminUsers: () => useAdminUsersMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const mockLists = [
  {
    id: "list-1",
    name: "Testlista 1",
    description: "En bra lista",
    status: "active",
    total_count: 100,
    stats: { total: 100, new: 50, assigned: 20, callback: 10, meeting_booked: 5, customer: 3, quarantine: 7, bad_number: 5 },
    inserted_at: "2026-01-01T10:00:00Z",
  },
  {
    id: "list-2",
    name: "Testlista 2",
    description: null,
    status: "paused",
    total_count: 0,
    stats: null,
    inserted_at: "2026-02-01T10:00:00Z",
  },
];

describe("AdminListsPage", () => {
  beforeEach(() => {
    useLeadListsMock.mockReturnValue({ data: mockLists, isLoading: false });
    useAdminUsersMock.mockReturnValue({ data: [], isLoading: false });
    useUpdateListMock.mockReturnValue({ mutate: updateMutateMock, isPending: false });
    useLeadListAgentsMock.mockReturnValue({ data: [] });
    useLeadListLeadsMock.mockReturnValue({ data: [], isLoading: false });
    useAssignAgentMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useRemoveAgentMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders page heading", () => {
    render(<AdminListsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Listor")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    useLeadListsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AdminListsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar...")).toBeInTheDocument();
  });

  it("renders empty state when no lists", () => {
    useLeadListsMock.mockReturnValue({ data: [], isLoading: false });
    render(<AdminListsPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Inga listor hittade/)).toBeInTheDocument();
  });

  it("renders list names", () => {
    render(<AdminListsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Testlista 1")).toBeInTheDocument();
    expect(screen.getByText("Testlista 2")).toBeInTheDocument();
  });

  it("renders status badges", () => {
    render(<AdminListsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.getByText("Pausad")).toBeInTheDocument();
  });

  it("renders Pausa button for active list", () => {
    render(<AdminListsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Pausa")).toBeInTheDocument();
  });

  it("renders Aktivera button for paused list", () => {
    render(<AdminListsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Aktivera")).toBeInTheDocument();
  });

  it("calls updateList.mutate when Pausa is clicked", () => {
    render(<AdminListsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Pausa"));
    expect(updateMutateMock).toHaveBeenCalledWith({ id: "list-1", status: "paused" });
  });

  it("expands list detail on row click", () => {
    render(<AdminListsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Testlista 1"));
    expect(screen.getByText("Tilldelade agenter")).toBeInTheDocument();
  });

  it("collapses expanded list on second click", () => {
    render(<AdminListsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Testlista 1"));
    expect(screen.getByText("Tilldelade agenter")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Testlista 1"));
    expect(screen.queryByText("Tilldelade agenter")).not.toBeInTheDocument();
  });
});
