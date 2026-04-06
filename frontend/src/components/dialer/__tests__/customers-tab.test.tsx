import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomersTab } from "../customers-tab";

vi.mock("@/api/deals", () => ({
  useDeals: vi.fn(),
}));

import { useDeals } from "@/api/deals";
const mockUseDeals = vi.mocked(useDeals);

const wonDeal = {
  id: "d1",
  lead_id: "l1",
  user_id: "u1",
  stage: "won" as const,
  website_url: "https://kund.se",
  contract_url: null,
  domain: "kund.se",
  domain_sponsored: false,
  notes: null,
  lead_name: "Vunnen Kund AB",
  user_name: "Agent 1",
  inserted_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const activeDeal = {
  id: "d2",
  lead_id: "l2",
  user_id: "u1",
  stage: "meeting_booked" as const,
  website_url: null,
  contract_url: null,
  domain: null,
  domain_sponsored: false,
  notes: null,
  lead_name: "Aktiv Deal AB",
  user_name: "Agent 1",
  inserted_at: "2026-01-02T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CustomersTab", () => {
  it("shows only won deals", () => {
    mockUseDeals.mockReturnValue({
      data: [wonDeal, activeDeal],
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    render(<CustomersTab onSelectDeal={() => {}} />);

    expect(screen.getByText("Vunnen Kund AB")).toBeInTheDocument();
    expect(screen.queryByText("Aktiv Deal AB")).not.toBeInTheDocument();
  });

  it("shows empty state when no won deals", () => {
    mockUseDeals.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    render(<CustomersTab onSelectDeal={() => {}} />);

    expect(screen.getByText("Inga kunder ännu")).toBeInTheDocument();
  });

  it("shows empty state when all deals are non-won", () => {
    mockUseDeals.mockReturnValue({
      data: [activeDeal],
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    render(<CustomersTab onSelectDeal={() => {}} />);

    expect(screen.getByText("Inga kunder ännu")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockUseDeals.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useDeals>);

    render(<CustomersTab onSelectDeal={() => {}} />);

    expect(screen.getByText("Laddar kunder...")).toBeInTheDocument();
  });

  it("calls onSelectDeal when clicking a customer row", () => {
    mockUseDeals.mockReturnValue({
      data: [wonDeal],
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    const onSelect = vi.fn();
    render(<CustomersTab onSelectDeal={onSelect} />);

    fireEvent.click(screen.getByText("Vunnen Kund AB"));
    expect(onSelect).toHaveBeenCalledWith("d1");
  });

  it("shows domain column", () => {
    mockUseDeals.mockReturnValue({
      data: [wonDeal],
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    render(<CustomersTab onSelectDeal={() => {}} />);

    expect(screen.getByText("kund.se")).toBeInTheDocument();
  });

  it("falls back to lead_id when lead_name is null", () => {
    mockUseDeals.mockReturnValue({
      data: [{ ...wonDeal, lead_name: null, lead_id: "fallback-id" }],
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    render(<CustomersTab onSelectDeal={() => {}} />);

    expect(screen.getByText("fallback-id")).toBeInTheDocument();
  });
});
