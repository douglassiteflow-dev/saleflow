import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadDetailPage } from "../lead-detail";

const useLeadDetailMock = vi.fn();
vi.mock("@/api/leads", () => ({
  useLeadDetail: () => useLeadDetailMock(),
}));

vi.mock("@/api/telavox", () => ({
  useTelavoxStatus: vi.fn(() => ({ data: undefined })),
  useDial: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useHangup: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const mockLeadDetail = {
  lead: {
    id: "1",
    företag: "Test AB",
    telefon: "+46701234567",
    epost: null,
    hemsida: null,
    adress: null,
    postnummer: null,
    stad: null,
    bransch: null,
    orgnr: null,
    omsättning_tkr: null,
    vinst_tkr: null,
    anställda: null,
    vd_namn: null,
    bolagsform: null,
    status: "new",
    quarantine_until: null,
    callback_at: null,
    callback_reminded_at: null,
    imported_at: null,
    inserted_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  calls: [],
  audit_logs: [],
};

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
    expect(screen.getByText("Laddar kundkort")).toBeInTheDocument();
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
      data: mockLeadDetail,
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();
    // "Test AB" appears in page title h1 and card heading h3
    expect(screen.getAllByText("Test AB").length).toBeGreaterThanOrEqual(1);
  });
});
