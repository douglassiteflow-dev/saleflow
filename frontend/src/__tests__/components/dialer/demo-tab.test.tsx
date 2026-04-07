import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoTab } from "@/components/dialer/demo-tab";

vi.mock("@/api/demo-configs", () => ({
  useDemoConfigs: vi.fn(),
}));

import { useDemoConfigs } from "@/api/demo-configs";

const mockUseDemoConfigs = vi.mocked(useDemoConfigs);

const SAMPLE_CONFIGS = [
  {
    id: "dc-1",
    lead_id: "lead-1",
    user_id: "user-1",
    lead_name: "Acme AB",
    stage: "meeting_booked" as const,
    source_url: "https://acme.se",
    preview_url: null,
    notes: null,
    error: null,
    inserted_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "dc-2",
    lead_id: "lead-2",
    user_id: "user-1",
    lead_name: null,
    stage: "demo_ready" as const,
    source_url: "https://bolaget.se",
    preview_url: "https://preview.example.com/dc-2",
    notes: null,
    error: null,
    inserted_at: "2026-04-02T10:00:00Z",
    updated_at: "2026-04-02T10:00:00Z",
  },
  {
    id: "dc-3",
    lead_id: "lead-3",
    user_id: "user-1",
    lead_name: null,
    stage: "cancelled" as const,
    source_url: null,
    preview_url: null,
    notes: null,
    error: null,
    inserted_at: "2026-04-03T10:00:00Z",
    updated_at: "2026-04-03T10:00:00Z",
  },
];

describe("DemoTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state while fetching", () => {
    mockUseDemoConfigs.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={vi.fn()} />);

    expect(screen.getByText("Laddar demos...")).toBeInTheDocument();
  });

  it("shows empty state when there are no configs", () => {
    mockUseDemoConfigs.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={vi.fn()} />);

    expect(screen.getByText("Inga demo-konfigurationer ännu...")).toBeInTheDocument();
  });

  it("shows empty state when data is undefined and not loading", () => {
    mockUseDemoConfigs.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={vi.fn()} />);

    expect(screen.getByText("Inga demo-konfigurationer ännu...")).toBeInTheDocument();
  });

  it("renders list of demo configs", () => {
    mockUseDemoConfigs.mockReturnValue({ data: SAMPLE_CONFIGS, isLoading: false } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={vi.fn()} />);

    expect(screen.getByText("Acme AB")).toBeInTheDocument();
    expect(screen.getByText("https://bolaget.se")).toBeInTheDocument();
    expect(screen.getByText("lead-3")).toBeInTheDocument();
  });

  it("uses lead_name when available, falls back to source_url then lead_id", () => {
    mockUseDemoConfigs.mockReturnValue({ data: SAMPLE_CONFIGS, isLoading: false } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={vi.fn()} />);

    // dc-1 has lead_name
    expect(screen.getByText("Acme AB")).toBeInTheDocument();
    // dc-2 has no lead_name but has source_url
    expect(screen.getByText("https://bolaget.se")).toBeInTheDocument();
    // dc-3 has neither, falls back to lead_id
    expect(screen.getByText("lead-3")).toBeInTheDocument();
  });

  it("shows stage badges with correct labels", () => {
    mockUseDemoConfigs.mockReturnValue({ data: SAMPLE_CONFIGS, isLoading: false } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={vi.fn()} />);

    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Demo klar")).toBeInTheDocument();
    expect(screen.getByText("Avbruten")).toBeInTheDocument();
  });

  it("shows all stage badge variants", () => {
    const allStageConfigs = [
      { ...SAMPLE_CONFIGS[0], id: "s1", stage: "meeting_booked" as const },
      { ...SAMPLE_CONFIGS[0], id: "s2", stage: "generating" as const },
      { ...SAMPLE_CONFIGS[0], id: "s3", stage: "demo_ready" as const },
      { ...SAMPLE_CONFIGS[0], id: "s4", stage: "followup" as const },
      { ...SAMPLE_CONFIGS[0], id: "s5", stage: "cancelled" as const },
    ];
    mockUseDemoConfigs.mockReturnValue({ data: allStageConfigs, isLoading: false } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={vi.fn()} />);

    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Genererar...")).toBeInTheDocument();
    expect(screen.getByText("Demo klar")).toBeInTheDocument();
    expect(screen.getByText("Uppföljning")).toBeInTheDocument();
    expect(screen.getByText("Avbruten")).toBeInTheDocument();
  });

  it("calls onSelectDemoConfig with correct id when row is clicked", async () => {
    const user = userEvent.setup();
    const onSelectDemoConfig = vi.fn();
    mockUseDemoConfigs.mockReturnValue({ data: SAMPLE_CONFIGS, isLoading: false } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={onSelectDemoConfig} />);

    await user.click(screen.getByText("Acme AB"));

    expect(onSelectDemoConfig).toHaveBeenCalledOnce();
    expect(onSelectDemoConfig).toHaveBeenCalledWith("dc-1");
  });

  it("calls onSelectDemoConfig with correct id for second row", async () => {
    const user = userEvent.setup();
    const onSelectDemoConfig = vi.fn();
    mockUseDemoConfigs.mockReturnValue({ data: SAMPLE_CONFIGS, isLoading: false } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={onSelectDemoConfig} />);

    await user.click(screen.getByText("https://bolaget.se"));

    expect(onSelectDemoConfig).toHaveBeenCalledOnce();
    expect(onSelectDemoConfig).toHaveBeenCalledWith("dc-2");
  });

  it("renders table with correct column headers", () => {
    mockUseDemoConfigs.mockReturnValue({ data: SAMPLE_CONFIGS, isLoading: false } as ReturnType<typeof useDemoConfigs>);

    render(<DemoTab onSelectDemoConfig={vi.fn()} />);

    expect(screen.getByText("Företag")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });
});
