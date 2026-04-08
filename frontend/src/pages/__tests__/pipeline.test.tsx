import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PipelinePage } from "../pipeline";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const useDealsMock = vi.fn();
vi.mock("@/api/deals", () => ({
  useDeals: () => useDealsMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const baseDeal = {
  id: "d1",
  lead_id: "l1",
  user_id: "u1",
  website_url: null,
  domain: null,
  domain_sponsored: false,
  notes: null,
  meeting_outcome: null,
  needs_followup: false,
  inserted_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("PipelinePage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("renders loading state", () => {
    useDealsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar pipeline")).toBeInTheDocument();
  });

  it("renders empty state when no active deals", () => {
    useDealsMock.mockReturnValue({ data: [], isLoading: false });
    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga aktiva deals")).toBeInTheDocument();
  });

  it("renders empty state when only won deals exist", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, stage: "won", lead_name: "Won AB", user_name: "Agent" },
      ],
      isLoading: false,
    });
    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga aktiva deals")).toBeInTheDocument();
  });

  it("groups deals by stage", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, id: "d1", stage: "booking_wizard", lead_name: "Alpha AB", user_name: "Agent A" },
        { ...baseDeal, id: "d2", stage: "booking_wizard", lead_name: "Beta AB", user_name: "Agent B" },
        { ...baseDeal, id: "d3", stage: "meeting_completed", lead_name: "Gamma AB", user_name: "Agent C" },
      ],
      isLoading: false,
    });
    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText("Bokning pågår (2)")).toBeInTheDocument();
    expect(screen.getByText("Möte genomfört (1)")).toBeInTheDocument();
    expect(screen.getByText("Alpha AB")).toBeInTheDocument();
    expect(screen.getByText("Beta AB")).toBeInTheDocument();
    expect(screen.getByText("Gamma AB")).toBeInTheDocument();
  });

  it("hides stages with no deals", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, id: "d1", stage: "meeting_completed", lead_name: "Only AB", user_name: "Agent" },
      ],
      isLoading: false,
    });
    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText("Möte genomfört (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Bokning pågår/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Demo schemalagd/)).not.toBeInTheDocument();
  });

  it("renders page title", () => {
    useDealsMock.mockReturnValue({ data: [], isLoading: false });
    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
  });

  it("navigates to deal detail on row click", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, id: "d1", stage: "booking_wizard", lead_name: "Click AB", user_name: "Agent" },
      ],
      isLoading: false,
    });
    render(<PipelinePage />, { wrapper: Wrapper });
    const row = screen.getByText("Click AB").closest("tr");
    if (row) fireEvent.click(row);
    expect(navigateMock).toHaveBeenCalledWith("/pipeline/d1");
  });

  it("shows agent name in table", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, id: "d1", stage: "demo_scheduled", lead_name: "Test AB", user_name: "Jane Doe" },
      ],
      isLoading: false,
    });
    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });
});
