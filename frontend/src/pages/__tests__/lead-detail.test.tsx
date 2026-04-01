import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadDetailPage } from "../lead-detail";

const useLeadDetailMock = vi.fn();
vi.mock("@/api/leads", () => ({
  useLeadDetail: () => useLeadDetailMock(),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/leads/1"]}>
        <Routes>
          <Route path="/leads/:id" element={<LeadDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LeadDetailPage", () => {
  it("shows loading state", () => {
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null });
    renderPage();
    expect(screen.getByText("Laddar kund...")).toBeInTheDocument();
  });

  it("shows error state", () => {
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("Not found") });
    renderPage();
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("shows error with no error object", () => {
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: null });
    renderPage();
    expect(screen.getByText("Kunde inte ladda kunddata.")).toBeInTheDocument();
  });

  it("shows error when data is undefined but no error", () => {
    useLeadDetailMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null });
    renderPage();
    expect(screen.getByText("Kunde inte ladda kunddata.")).toBeInTheDocument();
  });

  it("renders lead detail when loaded", () => {
    useLeadDetailMock.mockReturnValue({
      data: {
        id: "1",
        first_name: "Anna",
        last_name: "Svensson",
        company: "Test AB",
        phone: "+46701234567",
        email: null,
        status: "new",
        assigned_to: null,
        notes: null,
        priority: 1,
        callback_at: null,
        do_not_call: false,
        list_name: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        call_logs: [],
        audit_logs: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();
    // "Test AB" appears in page title h1 and card heading h3
    expect(screen.getAllByText("Test AB").length).toBeGreaterThanOrEqual(1);
  });

  it("renders lead name when company is null", () => {
    useLeadDetailMock.mockReturnValue({
      data: {
        id: "1",
        first_name: "Anna",
        last_name: "Svensson",
        company: null,
        phone: "+46701234567",
        email: null,
        status: "new",
        assigned_to: null,
        notes: null,
        priority: 1,
        callback_at: null,
        do_not_call: false,
        list_name: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        call_logs: [],
        audit_logs: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();
    // h1 should show "Anna Svensson" instead of company
    expect(screen.getAllByText("Anna Svensson").length).toBeGreaterThanOrEqual(1);
  });
});
