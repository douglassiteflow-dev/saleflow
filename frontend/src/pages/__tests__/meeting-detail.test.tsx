import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeetingDetailPage } from "../meeting-detail";

const useMeetingDetailMock = vi.fn();
const useUpdateMeetingMock = vi.fn();
const useCancelMeetingMock = vi.fn();
const useDialMock = vi.fn();
const updateMutateMock = vi.fn();
const cancelMutateMock = vi.fn();
const dialMutateMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/api/meetings", () => ({
  useMeetingDetail: (id: string | undefined) => useMeetingDetailMock(id),
  useUpdateMeeting: () => useUpdateMeetingMock(),
  useCancelMeeting: () => useCancelMeetingMock(),
}));

vi.mock("@/api/telavox", () => ({
  useDial: () => useDialMock(),
}));

vi.mock("@/components/dialer/call-modal", () => ({
  CallModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="call-modal">
      <button onClick={onClose}>Stäng</button>
    </div>
  ),
}));

vi.mock("@/components/send-invite-button", () => ({
  SendInviteButton: () => <button>Skicka inbjudan</button>,
}));

vi.mock("@/components/history-timeline", () => ({
  HistoryTimeline: () => <div data-testid="history-timeline">Historia</div>,
}));

vi.mock("@/lib/date", () => ({
  todayISO: () => "2026-04-08",
}));

function renderPage(id = "meet-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/meetings/${id}`]}>
        <Routes>
          <Route path="/meetings/:id" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockData = {
  meeting: {
    id: "meet-1",
    title: "Demo-möte med Acme",
    meeting_date: "2026-04-10",
    meeting_time: "10:00:00",
    duration_minutes: 45,
    status: "scheduled" as const,
    notes: "Förbered demo",
    user_name: "Anna Agent",
    teams_join_url: null,
    attendee_email: null,
    attendee_name: null,
    reminded_at: null,
  },
  lead: {
    id: "lead-1",
    företag: "Acme AB",
    telefon: "070-123 45 67",
    epost: "info@acme.se",
    adress: "Acmegatan 1",
    postnummer: "12345",
    stad: "Göteborg",
    bransch: "Handel",
    omsättning_tkr: null,
    vd_namn: "Karl Karlsson",
    status: "meeting_booked" as const,
    källa: null,
  },
  calls: [],
};

describe("MeetingDetailPage", () => {
  beforeEach(() => {
    useMeetingDetailMock.mockReturnValue({ data: mockData, isLoading: false });
    useUpdateMeetingMock.mockReturnValue({ mutate: updateMutateMock, isPending: false });
    useCancelMeetingMock.mockReturnValue({ mutate: cancelMutateMock, isPending: false });
    useDialMock.mockReturnValue({ mutate: dialMutateMock, isPending: false });
  });

  it("renders loading state", () => {
    useMeetingDetailMock.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByText("Laddar möte")).toBeInTheDocument();
  });

  it("renders meeting title", () => {
    renderPage();
    expect(screen.getByText("Demo-möte med Acme")).toBeInTheDocument();
  });

  it("renders back button", () => {
    renderPage();
    expect(screen.getByText("Tillbaka")).toBeInTheDocument();
  });

  it("renders meeting info card", () => {
    renderPage();
    expect(screen.getByText("Mötesinfo")).toBeInTheDocument();
  });

  it("renders lead company name in right column", () => {
    renderPage();
    expect(screen.getByText("Acme AB")).toBeInTheDocument();
  });

  it("renders agent name", () => {
    renderPage();
    expect(screen.getByText("Anna Agent")).toBeInTheDocument();
  });

  it("renders notes", () => {
    renderPage();
    expect(screen.getByText("Förbered demo")).toBeInTheDocument();
  });

  it("renders action buttons for scheduled meeting", () => {
    renderPage();
    expect(screen.getByText("Markera genomförd")).toBeInTheDocument();
    expect(screen.getByText("Boka om")).toBeInTheDocument();
    expect(screen.getByText("Avboka")).toBeInTheDocument();
  });

  it("renders Återställ button for cancelled meeting", () => {
    useMeetingDetailMock.mockReturnValue({
      data: { ...mockData, meeting: { ...mockData.meeting, status: "cancelled" as const } },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Återställ & boka om")).toBeInTheDocument();
  });

  it("opens edit form when Boka om is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByText("Boka om"));
    expect(screen.getByText("Spara")).toBeInTheDocument();
    expect(screen.getByText("Avbryt")).toBeInTheDocument();
  });

  it("calls updateMeeting when Markera genomförd is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByText("Markera genomförd"));
    expect(updateMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "meet-1", status: "completed" }),
    );
  });

  it("renders history timeline", () => {
    renderPage();
    expect(screen.getByTestId("history-timeline")).toBeInTheDocument();
  });

  it("renders Ring button for scheduled meeting", () => {
    renderPage();
    expect(screen.getByText("Ring")).toBeInTheDocument();
  });

  it("navigates back to meetings on Tillbaka click", () => {
    renderPage();
    fireEvent.click(screen.getByText("Tillbaka"));
    expect(navigateMock).toHaveBeenCalledWith("/meetings");
  });
});
