import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoDetailTab } from "@/components/dialer/demo-detail-tab";
import type { DemoConfigDetail } from "@/api/types";

// ── Mocks ──

vi.mock("@/api/demo-configs", () => ({
  useDemoConfigDetail: vi.fn(),
  useAdvanceDemoConfig: vi.fn(),
  useRetryDemoConfig: vi.fn(),
}));

vi.mock("@/lib/format", () => ({
  formatPhone: (v: string) => v,
  formatDate: (v: string) => v,
  formatTime: (v: string) => v,
}));

// Mock EventSource globally
const mockClose = vi.fn();
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = mockClose;
  constructor(public url: string) {}
}
vi.stubGlobal("EventSource", MockEventSource);

import { useDemoConfigDetail, useAdvanceDemoConfig, useRetryDemoConfig } from "@/api/demo-configs";

const mockUseDemoConfigDetail = vi.mocked(useDemoConfigDetail);
const mockUseAdvanceDemoConfig = vi.mocked(useAdvanceDemoConfig);
const mockUseRetryDemoConfig = vi.mocked(useRetryDemoConfig);

// ── Fixtures ──

function makeDetail(overrides: Partial<DemoConfigDetail> = {}): DemoConfigDetail {
  return {
    id: "dc-1",
    lead_id: "lead-1",
    user_id: "user-1",
    lead_name: "Acme AB",
    stage: "meeting_booked",
    source_url: "https://acme.se",
    preview_url: null,
    notes: null,
    error: null,
    inserted_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    lead: {
      id: "lead-1",
      company_name: "Acme AB",
      phone: "0701234567",
      email: "info@acme.se",
    },
    meetings: [],
    ...overrides,
  };
}

const mutateFn = vi.fn();
const defaultMutation = { mutate: mutateFn, isPending: false } as unknown as ReturnType<typeof useAdvanceDemoConfig>;

// ── Tests ──

describe("DemoDetailTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAdvanceDemoConfig.mockReturnValue(defaultMutation);
    mockUseRetryDemoConfig.mockReturnValue(defaultMutation);
  });

  it("renders loading state", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Laddar demo...")).toBeInTheDocument();
  });

  it("renders company name and stage indicator", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail(),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Acme AB")).toBeInTheDocument();
    expect(screen.getByText("1. Möte bokat")).toBeInTheDocument();
  });

  it("shows back button that calls onBack", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail(),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={onBack} />);

    const backButton = screen.getByText("← Tillbaka");
    expect(backButton).toBeInTheDocument();

    await user.click(backButton);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows no-link message when meeting_booked has no source_url", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "meeting_booked", source_url: null }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Ingen länk angiven — demo genereras inte")).toBeInTheDocument();
  });

  it("shows waiting message when meeting_booked has source_url", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "meeting_booked", source_url: "https://acme.se" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Väntar på att genereringen ska starta...")).toBeInTheDocument();
  });

  it("shows generating message and log container when generating", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "generating" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Genererar hemsida... Uppskattad tid: ~6–10 min")).toBeInTheDocument();
    expect(screen.getByTestId("log-container")).toBeInTheDocument();
  });

  it("opens EventSource when generating and closes on unmount", () => {
    const constructorSpy = vi.spyOn(globalThis, "EventSource" as never);
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "generating" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    const { unmount } = render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(constructorSpy).toHaveBeenCalledWith("/api/demo-configs/dc-1/logs");

    unmount();
    expect(mockClose).toHaveBeenCalled();
    constructorSpy.mockRestore();
  });

  it("shows 'Öppna i ny flik' when demo_ready with preview_url", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://preview.example.com/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    const link = screen.getByText("Öppna i ny flik");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "https://preview.example.com/dc-1");
    expect(link.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("shows advance and retry buttons when demo_ready", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://preview.example.com/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Gå till uppföljning →")).toBeInTheDocument();
    expect(screen.getByText("Generera om")).toBeInTheDocument();
  });

  it("calls advance mutation when 'Gå till uppföljning →' is clicked", async () => {
    const user = userEvent.setup();
    const advanceMutate = vi.fn();
    mockUseAdvanceDemoConfig.mockReturnValue({
      mutate: advanceMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useAdvanceDemoConfig>);

    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://preview.example.com/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    await user.click(screen.getByText("Gå till uppföljning →"));
    expect(advanceMutate).toHaveBeenCalledWith("dc-1");
  });

  it("calls retry mutation when 'Generera om' is clicked", async () => {
    const user = userEvent.setup();
    const retryMutate = vi.fn();
    mockUseRetryDemoConfig.mockReturnValue({
      mutate: retryMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRetryDemoConfig>);

    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://preview.example.com/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    await user.click(screen.getByText("Generera om"));
    expect(retryMutate).toHaveBeenCalledWith("dc-1");
  });

  it("renders iframe with preview_url when demo_ready", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://preview.example.com/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    const iframe = screen.getByTitle("Demo preview");
    expect(iframe).toHaveAttribute("src", "https://preview.example.com/dc-1");
  });

  it("shows followup content with demo link and lead info", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({
        stage: "followup",
        preview_url: "https://preview.example.com/dc-1",
        meetings: [
          { id: "m-1", title: "Demo med Acme", meeting_date: "2026-04-10", meeting_time: "14:00", status: "scheduled" },
        ],
      }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("https://preview.example.com/dc-1")).toBeInTheDocument();
    expect(screen.getByText("Demo med Acme")).toBeInTheDocument();
    // "Acme AB" appears in both header and kundinfo section
    expect(screen.getAllByText("Acme AB")).toHaveLength(2);
    expect(screen.getByText("info@acme.se")).toBeInTheDocument();
  });

  it("shows empty meetings message in followup when no meetings", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "followup", meetings: [] }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Inga möten.")).toBeInTheDocument();
  });

  it("uses lead.company_name as fallback when lead_name is null", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ lead_name: null, lead: { id: "l-1", company_name: "Fallback Corp", phone: null, email: null } }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Fallback Corp")).toBeInTheDocument();
  });

  it("does not open EventSource when stage is not generating", () => {
    const constructorSpy = vi.spyOn(globalThis, "EventSource" as never);
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://preview.example.com/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(constructorSpy).not.toHaveBeenCalled();
    constructorSpy.mockRestore();
  });
});
