import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DealDetailTab } from "@/components/dialer/deal-detail-tab";
import type { DealDetailData } from "@/api/types";

// ── Mocks ──

vi.mock("@/api/deals", () => ({
  useDealDetail: vi.fn(),
}));

vi.mock("@/api/questionnaire-admin", () => ({
  useSendQuestionnaire: vi.fn(),
}));

vi.mock("@/api/contract-admin", () => ({
  useSendContract: vi.fn(),
}));

vi.mock("@/lib/format", () => ({
  formatPhone: (v: string) => v,
  formatDate: (v: string) => v,
  formatTime: (v: string) => v,
}));

import { useDealDetail } from "@/api/deals";
import { useSendQuestionnaire } from "@/api/questionnaire-admin";
import { useSendContract } from "@/api/contract-admin";

const mockUseDealDetail = vi.mocked(useDealDetail);
const mockUseSendQuestionnaire = vi.mocked(useSendQuestionnaire);
const mockUseSendContract = vi.mocked(useSendContract);

// ── Fixtures ──

function makeData(overrides: Partial<DealDetailData> = {}): DealDetailData {
  return {
    deal: {
      id: "deal-1",
      lead_id: "lead-1",
      user_id: "user-1",
      stage: "booking_wizard",
      website_url: null,
      domain: null,
      domain_sponsored: false,
      notes: null,
      meeting_outcome: null,
      needs_followup: false,
      lead_name: "Acme AB",
      user_name: "Agent Smith",
      inserted_at: "2026-04-01T10:00:00Z",
      updated_at: "2026-04-01T10:00:00Z",
    },
    lead: {
      id: "lead-1",
      företag: "Acme AB",
      telefon: "0701234567",
      telefon_2: null,
      epost: "info@acme.se",
      hemsida: null,
      adress: "Storgatan 1",
      postnummer: "12345",
      stad: "Stockholm",
      bransch: "Tech",
      orgnr: null,
      omsättning_tkr: null,
      vinst_tkr: null,
      anställda: null,
      vd_namn: null,
      bolagsform: null,
      källa: null,
      status: "assigned",
      quarantine_until: null,
      callback_at: null,
      callback_reminded_at: null,
      imported_at: null,
      inserted_at: "2026-04-01T10:00:00Z",
      updated_at: "2026-04-01T10:00:00Z",
    },
    meetings: [],
    audit_logs: [],
    ...overrides,
  };
}

function makeMutation(overrides = {}) {
  return { mutate: vi.fn(), isPending: false, ...overrides } as unknown as ReturnType<
    typeof useSendQuestionnaire
  >;
}

// ── Tests ──

describe("DealDetailTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSendQuestionnaire.mockReturnValue(makeMutation());
    mockUseSendContract.mockReturnValue(makeMutation() as unknown as ReturnType<typeof useSendContract>);
  });

  it("renders loading state", () => {
    mockUseDealDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    expect(screen.getByText("Laddar deal...")).toBeInTheDocument();
  });

  it("renders deal company name in header", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData(),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    expect(screen.getAllByText("Acme AB").length).toBeGreaterThanOrEqual(1);
  });

  it("renders stage indicator steps", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData(),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    const steps = screen.getAllByTestId("stage-step");
    expect(steps.length).toBeGreaterThan(0);
  });

  it("shows website URL with copy button when present", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData({ deal: { ...makeData().deal, website_url: "https://acme.se" } }),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    expect(screen.getByText("https://acme.se")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopiera" })).toBeInTheDocument();
  });

  it("does not show website section when URL is null", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData(),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    expect(screen.queryByText("Demo-länk")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kopiera" })).not.toBeInTheDocument();
  });

  it("shows SendQuestionnaireForm at meeting_completed stage", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData({ deal: { ...makeData().deal, stage: "meeting_completed" } }),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    // Section heading + button both say "Skicka formulär" — use getAllByText
    expect(screen.getAllByText("Skicka formulär").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Skicka formulär" })).toBeInTheDocument();
  });

  it("does not show SendQuestionnaireForm at other stages", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData({ deal: { ...makeData().deal, stage: "booking_wizard" } }),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Skicka formulär" })).not.toBeInTheDocument();
  });

  it("shows SendContractForm at questionnaire_sent stage", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData({ deal: { ...makeData().deal, stage: "questionnaire_sent" } }),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    // Section heading + button both say "Skicka avtal" — use getAllByText
    expect(screen.getAllByText("Skicka avtal").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Skicka avtal" })).toBeInTheDocument();
  });

  it("does not show SendContractForm at other stages", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData({ deal: { ...makeData().deal, stage: "booking_wizard" } }),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Skicka avtal" })).not.toBeInTheDocument();
  });

  it("shows empty meetings message when no meetings", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData({ meetings: [] }),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    expect(screen.getByText("Inga möten.")).toBeInTheDocument();
  });

  it("shows meetings list when meetings exist", () => {
    const meetings = [
      {
        id: "m-1",
        lead_id: "lead-1",
        user_id: "user-1",
        title: "Demo med Acme",
        meeting_date: "2026-04-10",
        meeting_time: "14:00",
        notes: null,
        duration_minutes: 60,
        status: "scheduled" as const,
        reminded_at: null,
        teams_join_url: null,
        teams_event_id: null,
        attendee_name: null,
        attendee_email: null,
        updated_at: "2026-04-01T10:00:00Z",
        inserted_at: "2026-04-01T10:00:00Z",
      },
    ];

    mockUseDealDetail.mockReturnValue({
      data: makeData({ meetings }),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    expect(screen.getByText("Demo med Acme")).toBeInTheDocument();
  });

  it("shows lead info section", () => {
    mockUseDealDetail.mockReturnValue({
      data: makeData(),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={vi.fn()} />);
    expect(screen.getByText("Kundinfo")).toBeInTheDocument();
    expect(screen.getByText("0701234567")).toBeInTheDocument();
    expect(screen.getByText("info@acme.se")).toBeInTheDocument();
  });

  it("shows back button that calls onBack", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    mockUseDealDetail.mockReturnValue({
      data: makeData(),
      isLoading: false,
    } as ReturnType<typeof useDealDetail>);

    render(<DealDetailTab dealId="deal-1" onBack={onBack} />);
    await user.click(screen.getByText("← Tillbaka"));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
