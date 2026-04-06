import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeetingsPage } from "../meetings";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const cancelMutateMock = vi.fn();
const useMeetingsMock = vi.fn();

vi.mock("@/api/meetings", () => ({
  useMeetings: () => useMeetingsMock(),
  useCancelMeeting: vi.fn(() => ({
    mutate: cancelMutateMock,
    isPending: false,
  })),
  useCreateMeeting: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

// Future date for upcoming meetings
function futureDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

describe("MeetingsPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    cancelMutateMock.mockClear();
    useMeetingsMock.mockReturnValue({
      data: [
        {
          id: "m1",
          lead_id: "l1",
          user_id: "u1",
          title: "Demo",
          meeting_date: futureDateString(),
          meeting_time: "14:00:00",
          notes: null,
          status: "scheduled",
          reminded_at: null,
          updated_at: "2024-01-01T00:00:00Z",
          inserted_at: "2024-01-01T00:00:00Z",
          user_name: "Jane Agent",
          lead: { id: "l1", företag: "Acme AB", telefon: "+46701234567" },
        },
        {
          id: "m2",
          lead_id: "l2",
          user_id: "u1",
          title: "Follow-up",
          meeting_date: "2024-06-02",
          meeting_time: "10:00:00",
          notes: null,
          status: "cancelled",
          reminded_at: null,
          updated_at: "2024-01-01T00:00:00Z",
          inserted_at: "2024-01-01T00:00:00Z",
          user_name: "Jane Agent",
          lead: { id: "l2", företag: "Beta AB", telefon: "+46702345678" },
        },
      ],
      isLoading: false,
    });
  });

  it("renders page title", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Möten")).toBeInTheDocument();
  });

  it("renders upcoming meetings table", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    // "Kommande" appears in both tab and card title
    const kommande = screen.getAllByText("Kommande");
    expect(kommande.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Demo")).toBeInTheDocument();
    // Cancelled meeting should be filtered out in upcoming tab
    expect(screen.queryByText("Follow-up")).not.toBeInTheDocument();
  });

  it("shows new meeting button", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Nytt möte")).toBeInTheDocument();
  });

  it("toggles meeting form on button click", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nytt möte"));
    expect(screen.getByText("Stäng formulär")).toBeInTheDocument();
  });

  it("renders cancel button for scheduled meetings", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Avboka")).toBeInTheDocument();
  });

  it("calls cancel meeting after confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MeetingsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Avboka"));
    expect(cancelMutateMock).toHaveBeenCalledWith("m1");
  });

  it("does not cancel when confirm is rejected", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MeetingsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Avboka"));
    expect(cancelMutateMock).not.toHaveBeenCalled();
  });

  it("renders loading state", () => {
    useMeetingsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar möten")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    useMeetingsMock.mockReturnValue({ data: [], isLoading: false });
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga möten att visa.")).toBeInTheDocument();
  });

  it("closes form when cancel callback fires", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nytt möte"));
    expect(screen.getByText("Avbryt")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Avbryt"));
    expect(screen.queryByText("Avbryt")).not.toBeInTheDocument();
  });

  it("renders multiple scheduled meeting rows", () => {
    useMeetingsMock.mockReturnValue({
      data: [
        {
          id: "m1",
          lead_id: "l1",
          user_id: "u1",
          title: "First",
          meeting_date: futureDateString(),
          meeting_time: "10:00:00",
          notes: null,
          status: "scheduled",
          reminded_at: null,
          updated_at: "2024-01-01T00:00:00Z",
          inserted_at: "",
          user_name: "Agent A",
          lead: { id: "l1", företag: "First AB" },
        },
        {
          id: "m2",
          lead_id: "l2",
          user_id: "u1",
          title: "Second",
          meeting_date: futureDateString(),
          meeting_time: "14:00:00",
          notes: null,
          status: "scheduled",
          reminded_at: null,
          updated_at: "2024-01-01T00:00:00Z",
          inserted_at: "",
          user_name: "Agent B",
          lead: { id: "l2", företag: "Second AB" },
        },
      ],
      isLoading: false,
    });
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
  });

  it("does not render cancel button for completed meetings", () => {
    useMeetingsMock.mockReturnValue({
      data: [
        {
          id: "m4",
          lead_id: "l4",
          user_id: "u1",
          title: "Done",
          meeting_date: futureDateString(),
          meeting_time: "10:00:00",
          notes: null,
          status: "completed",
          reminded_at: null,
          updated_at: "2024-01-01T00:00:00Z",
          inserted_at: "",
          user_name: "Agent",
          lead: null,
        },
      ],
      isLoading: false,
    });
    // Switch to 'all' tab to see completed meetings
    render(<MeetingsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Alla"));
    expect(screen.queryByText("Avboka")).not.toBeInTheDocument();
  });

  it("shows Företag and Agent columns", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Företag")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("displays lead företag in table", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Acme AB")).toBeInTheDocument();
  });

  it("displays user_name in table", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Jane Agent")).toBeInTheDocument();
  });

  it("navigates to meeting detail on row click", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    const row = screen.getByText("Demo").closest("tr");
    if (row) fireEvent.click(row);
    expect(navigateMock).toHaveBeenCalledWith(`/meetings/m1`);
  });

  it("shows filter tabs", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    // "Kommande" appears both as tab and card title
    const kommande = screen.getAllByText("Kommande");
    expect(kommande.length).toBe(2);
    expect(screen.getByText("Idag")).toBeInTheDocument();
    expect(screen.getByText("Alla")).toBeInTheDocument();
    expect(screen.getByText("Genomförda")).toBeInTheDocument();
    expect(screen.getByText("Avbokade")).toBeInTheDocument();
  });

  it("can switch to all tab and see cancelled meetings", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Alla"));
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
  });
});
