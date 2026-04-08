import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminRequestsPage } from "../admin-requests";

const useRequestsMock = vi.fn();
const useUpdateRequestMock = vi.fn();
const updateMutateMock = vi.fn();
const updateMutateAsyncMock = vi.fn();

vi.mock("@/api/requests", () => ({
  useRequests: () => useRequestsMock(),
  useUpdateRequest: () => useUpdateRequestMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const mockRequests = [
  {
    id: "req-1",
    type: "bug" as const,
    status: "new" as const,
    description: "Knappen fungerar inte",
    user_name: "Anna Agent",
    admin_notes: null,
    inserted_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "req-2",
    type: "feature" as const,
    status: "done" as const,
    description: "Lägg till exportfunktion",
    user_name: "Bo Berg",
    admin_notes: "Klart!",
    inserted_at: "2026-03-15T09:00:00Z",
  },
];

describe("AdminRequestsPage", () => {
  beforeEach(() => {
    useRequestsMock.mockReturnValue({ data: mockRequests, isLoading: false });
    useUpdateRequestMock.mockReturnValue({
      mutate: updateMutateMock,
      mutateAsync: updateMutateAsyncMock,
      isPending: false,
    });
  });

  it("renders page heading", () => {
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Förfrågningar")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    useRequestsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar förfrågningar")).toBeInTheDocument();
  });

  it("renders empty state when no requests", () => {
    useRequestsMock.mockReturnValue({ data: [], isLoading: false });
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga förfrågningar hittades.")).toBeInTheDocument();
  });

  it("renders request count in title", () => {
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Alla förfrågningar \(2\)/)).toBeInTheDocument();
  });

  it("renders type badges", () => {
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    // "Bugg" and "Funktion" appear in both filter dropdown and as type badges
    expect(screen.getAllByText("Bugg").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Funktion").length).toBeGreaterThanOrEqual(1);
    // Verify they are rendered as badge spans (not just option elements)
    const bugSpan = document.querySelector("span.bg-rose-50");
    expect(bugSpan?.textContent).toBe("Bugg");
  });

  it("renders user names", () => {
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Anna Agent")).toBeInTheDocument();
    expect(screen.getByText("Bo Berg")).toBeInTheDocument();
  });

  it("renders request descriptions", () => {
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Knappen fungerar inte")).toBeInTheDocument();
    expect(screen.getByText("Lägg till exportfunktion")).toBeInTheDocument();
  });

  it("filters by type", () => {
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    const typeSelect = screen.getByDisplayValue("Alla typer");
    fireEvent.change(typeSelect, { target: { value: "bug" } });
    expect(screen.getByText("Knappen fungerar inte")).toBeInTheDocument();
    expect(screen.queryByText("Lägg till exportfunktion")).not.toBeInTheDocument();
  });

  it("filters by status", () => {
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    const statusSelect = screen.getByDisplayValue("Alla statusar");
    fireEvent.change(statusSelect, { target: { value: "new" } });
    expect(screen.getByText("Knappen fungerar inte")).toBeInTheDocument();
    expect(screen.queryByText("Lägg till exportfunktion")).not.toBeInTheDocument();
  });

  it("expands row on click", () => {
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Knappen fungerar inte"));
    expect(screen.getByText("Fullständig beskrivning")).toBeInTheDocument();
  });

  it("closes expanded row when Avbryt is clicked", () => {
    render(<AdminRequestsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Knappen fungerar inte"));
    expect(screen.getByText("Fullständig beskrivning")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Avbryt"));
    expect(screen.queryByText("Fullständig beskrivning")).not.toBeInTheDocument();
  });
});
