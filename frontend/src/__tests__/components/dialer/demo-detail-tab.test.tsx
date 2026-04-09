import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoDetailTab } from "@/components/dialer/demo-detail-tab";
import type { DemoConfigDetail, Lead, Meeting, Questionnaire } from "@/api/types";

// ── Mocks ──

vi.mock("@/api/demo-configs", () => ({
  useDemoConfigDetail: vi.fn(),
  useRetryDemoConfig: vi.fn(),
  useMarkDemoHeld: vi.fn(),
}));

vi.mock("@/components/dialer/book-followup-modal", () => ({
  BookFollowupModal: ({ open, leadName }: { open: boolean; leadName: string }) =>
    open ? <div data-testid="book-followup-modal">Modal för {leadName}</div> : null,
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

import { useDemoConfigDetail, useRetryDemoConfig, useMarkDemoHeld } from "@/api/demo-configs";

const mockUseDemoConfigDetail = vi.mocked(useDemoConfigDetail);
const mockUseRetryDemoConfig = vi.mocked(useRetryDemoConfig);
const mockUseMarkDemoHeld = vi.mocked(useMarkDemoHeld);

// ── Fixtures ──

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    företag: "Acme AB",
    telefon: "0701234567",
    telefon_2: null,
    epost: "info@acme.se",
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
    källa: null,
    status: "ej_kontaktad",
    quarantine_until: null,
    callback_at: null,
    callback_reminded_at: null,
    imported_at: null,
    inserted_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    ...overrides,
  };
}

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "m-1",
    lead_id: "lead-1",
    user_id: "user-1",
    title: "Demo med Acme",
    meeting_date: "2026-04-10",
    meeting_time: "14:00",
    notes: null,
    duration_minutes: 30,
    status: "scheduled",
    reminded_at: null,
    teams_join_url: null,
    teams_event_id: null,
    attendee_name: null,
    attendee_email: null,
    inserted_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    ...overrides,
  };
}

function makeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return {
    id: "q-1",
    lead_id: "lead-1",
    deal_id: null,
    token: "q-token-1",
    status: "pending",
    customer_email: "c@e.se",
    opened_at: null,
    started_at: null,
    completed_at: null,
    inserted_at: "2026-04-09T14:32:00Z",
    updated_at: "2026-04-09T14:32:00Z",
    ...overrides,
  };
}

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
    health_score: null,
    inserted_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    lead: makeLead(),
    meetings: [],
    questionnaire: null,
    ...overrides,
  };
}

const mutateFn = vi.fn();
const defaultMutation = { mutate: mutateFn, isPending: false } as unknown as ReturnType<typeof useRetryDemoConfig>;

// ── Tests ──

describe("DemoDetailTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRetryDemoConfig.mockReturnValue(defaultMutation);
    mockUseMarkDemoHeld.mockReturnValue(defaultMutation);
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

  it("shows mark-held, retry, and preview link when demo_ready", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://demo.siteflow.se/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText(/Hemsidan är klar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /markera demo-mötet som genomfört/i })).toBeInTheDocument();
    expect(screen.getByText("Generera om")).toBeInTheDocument();
    expect(screen.getByText("https://demo.siteflow.se/dc-1")).toBeInTheDocument();
    // The modal's "Boka uppföljning →" button only appears in demo_held
    expect(screen.queryByText(/Boka uppföljning/i)).not.toBeInTheDocument();
  });

  it("calls mark-held mutation when 'Markera demo-mötet som genomfört' is clicked", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockUseMarkDemoHeld.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useMarkDemoHeld>);

    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://demo.siteflow.se/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /markera demo-mötet som genomfört/i }));
    expect(mutate).toHaveBeenCalledWith("dc-1");
  });

  it("shows marking text when mark-held isPending", () => {
    mockUseMarkDemoHeld.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof useMarkDemoHeld>);

    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://demo.siteflow.se/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Markerar...")).toBeInTheDocument();
    expect(screen.getByText("Markerar...").closest("button")).toBeDisabled();
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

  it("renders preview link URL when demo_ready has preview_url", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://demo.siteflow.se/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("https://demo.siteflow.se/dc-1")).toBeInTheDocument();
  });

  it("shows followup content with tracking, links, meeting and lead info", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({
        stage: "followup",
        preview_url: "https://demo.siteflow.se/acme",
        meetings: [makeMeeting({ title: "Uppföljning — Acme AB", teams_join_url: "https://teams.url/x" })],
        questionnaire: makeQuestionnaire({
          token: "tok-1",
          opened_at: "2026-04-09T14:45:00Z",
        }),
      }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    // Tracking labels
    expect(screen.getByText("Mail skickat:")).toBeInTheDocument();
    expect(screen.getByText("Frågeformulär öppnat:")).toBeInTheDocument();
    expect(screen.getByText("Formulär påbörjat:")).toBeInTheDocument();
    expect(screen.getByText("Formulär ifyllt:")).toBeInTheDocument();

    // Links
    expect(screen.getByText("https://demo.siteflow.se/acme")).toBeInTheDocument();
    expect(screen.getByText("Öppna formulär →")).toBeInTheDocument();
    expect(screen.getByText("Anslut till Teams-mötet →")).toBeInTheDocument();

    // Lead info
    expect(screen.getAllByText("Acme AB").length).toBeGreaterThan(0);
    expect(screen.getByText("info@acme.se")).toBeInTheDocument();
  });

  it("shows dash for missing tracking timestamps in followup", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({
        stage: "followup",
        questionnaire: makeQuestionnaire({ opened_at: null, started_at: null, completed_at: null }),
        meetings: [],
      }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    // 4 tracking rows total. Mail skickat has value (inserted_at); others show em-dash.
    const values = screen.getAllByTestId("tracking-value");
    expect(values).toHaveLength(4);
    const empty = values.filter((v) => v.getAttribute("data-empty") === "true");
    expect(empty).toHaveLength(3);
  });

  it("handles followup with no questionnaire gracefully", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "followup", questionnaire: null, meetings: [] }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    // Without questionnaire, all 4 tracking rows show em-dash
    const values = screen.getAllByTestId("tracking-value");
    expect(values).toHaveLength(4);
    const empty = values.filter((v) => v.getAttribute("data-empty") === "true");
    expect(empty).toHaveLength(4);
  });

  it("renders DemoHeldContent with preview link and Boka uppföljning button", async () => {
    const user = userEvent.setup();
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({
        stage: "demo_held",
        preview_url: "https://demo.siteflow.se/acme",
      }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText(/Demo-mötet är genomfört/i)).toBeInTheDocument();
    expect(screen.getByText("https://demo.siteflow.se/acme")).toBeInTheDocument();
    expect(screen.queryByTestId("book-followup-modal")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /boka uppföljning/i }));
    expect(screen.getByTestId("book-followup-modal")).toBeInTheDocument();
  });

  it("uses lead.företag as fallback when lead_name is null", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({
        lead_name: null,
        lead: makeLead({ id: "l-1", företag: "Fallback Corp", telefon: "0700000000", epost: null }),
      }),
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

  it("renders log lines when SSE onmessage fires", () => {
    let capturedES: MockEventSource | null = null;
    const OrigES = globalThis.EventSource;
    // Capture EventSource instances to trigger onmessage
    vi.stubGlobal("EventSource", class extends MockEventSource {
      constructor(url: string) {
        super(url);
        capturedES = this;
      }
    });

    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "generating" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    // Simulate SSE messages
    expect(capturedES).not.toBeNull();
    act(() => {
      capturedES!.onmessage!({ data: JSON.stringify({ type: "log", text: "Step 1 complete" }) } as MessageEvent);
    });
    act(() => {
      capturedES!.onmessage!({ data: JSON.stringify({ type: "log", text: "Step 2 complete" }) } as MessageEvent);
    });

    expect(screen.getByText("Step 1 complete")).toBeInTheDocument();
    expect(screen.getByText("Step 2 complete")).toBeInTheDocument();

    vi.stubGlobal("EventSource", OrigES);
  });

  it("ignores SSE messages that are not of type log", () => {
    let capturedES: MockEventSource | null = null;
    const OrigES = globalThis.EventSource;
    vi.stubGlobal("EventSource", class extends MockEventSource {
      constructor(url: string) {
        super(url);
        capturedES = this;
      }
    });

    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "generating" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    // Fire a non-log message
    act(() => {
      capturedES!.onmessage!({ data: JSON.stringify({ type: "status", text: "should not appear" }) } as MessageEvent);
    });

    const logContainer = screen.getByTestId("log-container");
    expect(logContainer.children).toHaveLength(0);

    vi.stubGlobal("EventSource", OrigES);
  });

  it("does not render preview section when demo_ready has no preview_url", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: null }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.queryByText("Deras demo-hemsida")).not.toBeInTheDocument();
    expect(screen.queryByText("Öppna i ny flik")).not.toBeInTheDocument();
    // Mark-held and retry buttons still render
    expect(screen.getByRole("button", { name: /markera demo-mötet/i })).toBeInTheDocument();
    expect(screen.getByText("Generera om")).toBeInTheDocument();
  });

  it("shows retrying text when retry isPending", () => {
    mockUseRetryDemoConfig.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof useRetryDemoConfig>);

    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "demo_ready", preview_url: "https://preview.example.com/dc-1" }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("Genererar om...")).toBeInTheDocument();
    expect(screen.getByText("Genererar om...").closest("button")).toBeDisabled();
  });

  it("does not show hemsida section in followup when preview_url is null", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({ stage: "followup", preview_url: null, meetings: [], questionnaire: null }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    // Hemsida heading should not be present without preview_url
    expect(screen.queryByText("Hemsida")).not.toBeInTheDocument();
  });

  it("does not show telefon and epost when lead lacks them in followup", () => {
    mockUseDemoConfigDetail.mockReturnValue({
      data: makeDetail({
        stage: "followup",
        preview_url: null,
        lead: makeLead({ id: "l-1", företag: "NoContact Inc", telefon: "", epost: null }),
        meetings: [],
      }),
      isLoading: false,
    } as ReturnType<typeof useDemoConfigDetail>);

    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />);

    expect(screen.getByText("NoContact Inc")).toBeInTheDocument();
    expect(screen.queryByText("Telefon")).not.toBeInTheDocument();
    expect(screen.queryByText("E-post")).not.toBeInTheDocument();
  });
});
