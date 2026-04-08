import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PipelineDetailPage } from "../pipeline-detail";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ id: "d1" }) };
});

const useDealDetailMock = vi.fn();
const advanceMutateMock = vi.fn();
const updateMutateMock = vi.fn();

vi.mock("@/api/deals", () => ({
  useDealDetail: (id: string | null | undefined) => useDealDetailMock(id),
  useAdvanceDeal: () => ({
    mutate: advanceMutateMock,
    isPending: false,
  }),
  useUpdateDeal: () => ({
    mutate: updateMutateMock,
    isPending: false,
  }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const mockLead = {
  id: "l1",
  företag: "Acme AB",
  telefon: "+46701234567",
  telefon_2: null,
  epost: "info@acme.se",
  hemsida: null,
  adress: "Storgatan 1",
  postnummer: "111 22",
  stad: "Stockholm",
  bransch: "IT",
  orgnr: null,
  omsättning_tkr: "5000",
  vinst_tkr: null,
  anställda: null,
  vd_namn: "Anna Svensson",
  bolagsform: null,
  källa: null,
  status: "meeting_booked" as const,
  quarantine_until: null,
  callback_at: null,
  callback_reminded_at: null,
  imported_at: null,
  inserted_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockDeal = {
  id: "d1",
  lead_id: "l1",
  user_id: "u1",
  stage: "demo_scheduled" as const,
  website_url: "https://acme.example.com",
  domain: null,
  domain_sponsored: false,
  notes: "Kontakta igen",
  meeting_outcome: null,
  needs_followup: false,
  lead_name: "Acme AB",
  user_name: "Agent A",
  inserted_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockMeetings = [
  {
    id: "m1",
    lead_id: "l1",
    user_id: "u1",
    title: "Intro-möte",
    meeting_date: "2024-06-01",
    meeting_time: "14:00:00",
    notes: null,
    duration_minutes: 30,
    status: "completed" as const,
    reminded_at: null,
    teams_join_url: null,
    teams_event_id: null,
    attendee_name: null,
    attendee_email: null,
    updated_at: "2024-01-01T00:00:00Z",
    inserted_at: "2024-01-01T00:00:00Z",
  },
];

describe("PipelineDetailPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    advanceMutateMock.mockClear();
    updateMutateMock.mockClear();
  });

  it("renders loading state", () => {
    useDealDetailMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<PipelineDetailPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar deal")).toBeInTheDocument();
  });

  it("renders deal and lead info", () => {
    useDealDetailMock.mockReturnValue({
      data: { deal: mockDeal, lead: mockLead, meetings: mockMeetings, audit_logs: [] },
      isLoading: false,
    });
    render(<PipelineDetailPage />, { wrapper: Wrapper });
    // Lead company name appears as title and in sidebar
    const acmeElements = screen.getAllByText("Acme AB");
    expect(acmeElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Stockholm")).toBeInTheDocument();
    expect(screen.getByText("Anna Svensson")).toBeInTheDocument();
    expect(screen.getByText("5000 tkr")).toBeInTheDocument();
  });

  it("renders stage indicator", () => {
    useDealDetailMock.mockReturnValue({
      data: { deal: mockDeal, lead: mockLead, meetings: mockMeetings, audit_logs: [] },
      isLoading: false,
    });
    render(<PipelineDetailPage />, { wrapper: Wrapper });
    const steps = screen.getAllByTestId("stage-step");
    expect(steps.length).toBe(6);
  });

  it("renders meetings list", () => {
    useDealDetailMock.mockReturnValue({
      data: { deal: mockDeal, lead: mockLead, meetings: mockMeetings, audit_logs: [] },
      isLoading: false,
    });
    render(<PipelineDetailPage />, { wrapper: Wrapper });
    expect(screen.getByText("Intro-möte")).toBeInTheDocument();
    expect(screen.getByText("Möten (1)")).toBeInTheDocument();
  });

  it("shows action button for current stage", () => {
    useDealDetailMock.mockReturnValue({
      data: { deal: mockDeal, lead: mockLead, meetings: mockMeetings, audit_logs: [] },
      isLoading: false,
    });
    render(<PipelineDetailPage />, { wrapper: Wrapper });
    expect(screen.getByText("Markera möte genomfört")).toBeInTheDocument();
  });

  it("shows website URL when present", () => {
    useDealDetailMock.mockReturnValue({
      data: { deal: mockDeal, lead: mockLead, meetings: mockMeetings, audit_logs: [] },
      isLoading: false,
    });
    render(<PipelineDetailPage />, { wrapper: Wrapper });
    expect(screen.getByText("https://acme.example.com")).toBeInTheDocument();
  });

  it("shows notes", () => {
    useDealDetailMock.mockReturnValue({
      data: { deal: mockDeal, lead: mockLead, meetings: mockMeetings, audit_logs: [] },
      isLoading: false,
    });
    render(<PipelineDetailPage />, { wrapper: Wrapper });
    expect(screen.getByText("Kontakta igen")).toBeInTheDocument();
  });

  it("renders Google Maps link when address exists", () => {
    useDealDetailMock.mockReturnValue({
      data: { deal: mockDeal, lead: mockLead, meetings: mockMeetings, audit_logs: [] },
      isLoading: false,
    });
    render(<PipelineDetailPage />, { wrapper: Wrapper });
    expect(screen.getByText("Visa på Google Maps")).toBeInTheDocument();
  });
});
