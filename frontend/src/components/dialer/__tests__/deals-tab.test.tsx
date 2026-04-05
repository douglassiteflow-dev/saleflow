import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DealsTab } from "../deals-tab";

const mockDeals = [
  {
    id: "d1",
    lead_id: "l1",
    user_id: "u1",
    stage: "meeting_booked" as const,
    website_url: null,
    contract_url: null,
    domain: null,
    domain_sponsored: false,
    notes: null,
    lead_name: "Testföretag AB",
    user_name: "Agent 1",
    inserted_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "d2",
    lead_id: "l2",
    user_id: "u1",
    stage: "deployed" as const,
    website_url: "https://example.com",
    contract_url: null,
    domain: "example.com",
    domain_sponsored: false,
    notes: null,
    lead_name: "Annat Företag",
    user_name: "Agent 1",
    inserted_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
  {
    id: "d3",
    lead_id: "l3",
    user_id: "u1",
    stage: "won" as const,
    website_url: "https://won.com",
    contract_url: null,
    domain: "won.com",
    domain_sponsored: false,
    notes: null,
    lead_name: "Vunnen Kund",
    user_name: "Agent 1",
    inserted_at: "2026-01-03T00:00:00Z",
    updated_at: "2026-01-03T00:00:00Z",
  },
];

vi.mock("@/api/deals", () => ({
  useDeals: vi.fn(),
}));

import { useDeals } from "@/api/deals";
const mockUseDeals = vi.mocked(useDeals);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DealsTab", () => {
  it("renders deals list", () => {
    mockUseDeals.mockReturnValue({
      data: mockDeals,
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    render(<DealsTab onSelectDeal={() => {}} />);

    expect(screen.getByText("Testföretag AB")).toBeInTheDocument();
    expect(screen.getByText("Annat Företag")).toBeInTheDocument();
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Demo-länk redo")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    mockUseDeals.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    render(<DealsTab onSelectDeal={() => {}} />);

    expect(screen.getByText("Inga deals ännu")).toBeInTheDocument();
  });

  it("filters out won deals", () => {
    mockUseDeals.mockReturnValue({
      data: mockDeals,
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    render(<DealsTab onSelectDeal={() => {}} />);

    expect(screen.getByText("Testföretag AB")).toBeInTheDocument();
    expect(screen.getByText("Annat Företag")).toBeInTheDocument();
    expect(screen.queryByText("Vunnen Kund")).not.toBeInTheDocument();
  });

  it("calls onSelectDeal when clicking a row", () => {
    mockUseDeals.mockReturnValue({
      data: mockDeals,
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    const onSelect = vi.fn();
    render(<DealsTab onSelectDeal={onSelect} />);

    fireEvent.click(screen.getByText("Testföretag AB"));
    expect(onSelect).toHaveBeenCalledWith("d1");
  });

  it("shows loading state", () => {
    mockUseDeals.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useDeals>);

    render(<DealsTab onSelectDeal={() => {}} />);

    expect(screen.getByText("Laddar deals...")).toBeInTheDocument();
  });

  it("falls back to lead_id when lead_name is null", () => {
    mockUseDeals.mockReturnValue({
      data: [
        {
          ...mockDeals[0],
          lead_name: null,
          lead_id: "fallback-lead-id",
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useDeals>);

    render(<DealsTab onSelectDeal={() => {}} />);

    expect(screen.getByText("fallback-lead-id")).toBeInTheDocument();
  });
});
