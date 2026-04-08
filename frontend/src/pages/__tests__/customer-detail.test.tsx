import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomerDetailPage } from "../customer-detail";

const useDealDetailMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/api/deals", () => ({
  useDealDetail: (id: string | undefined) => useDealDetailMock(id),
}));

vi.mock("@/components/deal-stage-indicator", () => ({
  DealStageIndicator: ({ currentStage }: { currentStage: string }) => (
    <div data-testid="deal-stage">{currentStage}</div>
  ),
}));

function renderPage(id = "deal-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/customers/${id}`]}>
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockData = {
  deal: {
    id: "deal-1",
    stage: "meeting_booked",
    website_url: "https://example.se",
    domain: "example.se",
    domain_sponsored: false,
    notes: "Viktiga anteckningar",
  },
  lead: {
    id: "lead-1",
    företag: "Example AB",
    telefon: "070-123 45 67",
    epost: "kontakt@example.se",
    adress: "Storgatan 1",
    postnummer: "11122",
    stad: "Stockholm",
    bransch: "IT",
    omsättning_tkr: 5000,
    vd_namn: "Lars Larsson",
    status: "customer" as const,
  },
  meetings: [
    {
      id: "meet-1",
      title: "Demo-möte",
      meeting_date: "2026-04-10",
      meeting_time: "10:00:00",
      status: "scheduled" as const,
    },
  ],
};

describe("CustomerDetailPage", () => {
  beforeEach(() => {
    useDealDetailMock.mockReturnValue({ data: mockData, isLoading: false });
  });

  it("renders loading state", () => {
    useDealDetailMock.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByText("Laddar kund")).toBeInTheDocument();
  });

  it("renders company name as heading", () => {
    renderPage();
    expect(screen.getAllByText("Example AB").length).toBeGreaterThanOrEqual(1);
  });

  it("renders back button", () => {
    renderPage();
    expect(screen.getByText("← Tillbaka")).toBeInTheDocument();
  });

  it("renders DealStageIndicator", () => {
    renderPage();
    expect(screen.getByTestId("deal-stage")).toBeInTheDocument();
    expect(screen.getByText("meeting_booked")).toBeInTheDocument();
  });

  it("renders website URL", () => {
    renderPage();
    expect(screen.getByText("https://example.se")).toBeInTheDocument();
  });

  it("renders domain", () => {
    renderPage();
    expect(screen.getByText("example.se")).toBeInTheDocument();
  });

  it("renders meetings section with count", () => {
    renderPage();
    expect(screen.getByText("Möten (1)")).toBeInTheDocument();
    expect(screen.getByText("Demo-möte")).toBeInTheDocument();
  });

  it("renders notes section", () => {
    renderPage();
    expect(screen.getByText("Viktiga anteckningar")).toBeInTheDocument();
  });

  it("renders lead contact info", () => {
    renderPage();
    expect(screen.getByText("Lars Larsson")).toBeInTheDocument();
    expect(screen.getByText("Stockholm")).toBeInTheDocument();
    expect(screen.getByText("IT")).toBeInTheDocument();
  });

  it("renders empty meetings state", () => {
    useDealDetailMock.mockReturnValue({
      data: { ...mockData, meetings: [] },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Möten (0)")).toBeInTheDocument();
    expect(screen.getByText("Inga möten kopplade")).toBeInTheDocument();
  });

  it("shows Google Maps link when address present", () => {
    renderPage();
    expect(screen.getByText("Visa på Google Maps")).toBeInTheDocument();
  });
});
