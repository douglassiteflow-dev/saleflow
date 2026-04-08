import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomersPage } from "../customers";

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

describe("CustomersPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("renders loading state", () => {
    useDealsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<CustomersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar kunder")).toBeInTheDocument();
  });

  it("renders empty state when no won deals", () => {
    useDealsMock.mockReturnValue({ data: [], isLoading: false });
    render(<CustomersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga kunder än")).toBeInTheDocument();
  });

  it("shows only won deals", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, id: "d1", stage: "won", lead_name: "Winner AB", user_name: "Agent A", domain: "winner.se" },
        { ...baseDeal, id: "d2", stage: "booking_wizard", lead_name: "Active AB", user_name: "Agent B", domain: null },
        { ...baseDeal, id: "d3", stage: "won", lead_name: "Also Won AB", user_name: "Agent C", domain: "alsowon.se" },
      ],
      isLoading: false,
    });
    render(<CustomersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Winner AB")).toBeInTheDocument();
    expect(screen.getByText("Also Won AB")).toBeInTheDocument();
    expect(screen.queryByText("Active AB")).not.toBeInTheDocument();
  });

  it("shows page title and customer count subtitle", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, id: "d1", stage: "won", lead_name: "Winner AB", user_name: "Agent", domain: "w.se" },
      ],
      isLoading: false,
    });
    render(<CustomersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Kunder")).toBeInTheDocument();
    expect(screen.getByText("1 kunder totalt")).toBeInTheDocument();
  });

  it("shows domain in table", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, id: "d1", stage: "won", lead_name: "Test AB", user_name: "Agent", domain: "test.se" },
      ],
      isLoading: false,
    });
    render(<CustomersPage />, { wrapper: Wrapper });
    expect(screen.getByText("test.se")).toBeInTheDocument();
  });

  it("shows avslutsdatum column header", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, id: "d1", stage: "won", lead_name: "Test AB", user_name: "Agent", domain: null },
      ],
      isLoading: false,
    });
    render(<CustomersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Avslutsdatum")).toBeInTheDocument();
  });

  it("navigates to pipeline detail on row click", () => {
    useDealsMock.mockReturnValue({
      data: [
        { ...baseDeal, id: "d1", stage: "won", lead_name: "Click AB", user_name: "Agent", domain: null },
      ],
      isLoading: false,
    });
    render(<CustomersPage />, { wrapper: Wrapper });
    const row = screen.getByText("Click AB").closest("tr");
    if (row) fireEvent.click(row);
    expect(navigateMock).toHaveBeenCalledWith("/pipeline/d1");
  });
});
