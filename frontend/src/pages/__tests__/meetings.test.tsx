import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeetingsPage } from "../meetings";

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

describe("MeetingsPage", () => {
  beforeEach(() => {
    useMeetingsMock.mockReturnValue({
      data: [
        {
          id: "m1",
          lead_id: "l1",
          user_id: "u1",
          title: "Demo",
          meeting_date: "2024-06-01",
          meeting_time: "14:00:00",
          notes: null,
          status: "scheduled",
          reminded_at: null,
          inserted_at: "2024-01-01T00:00:00Z",
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
          inserted_at: "2024-01-01T00:00:00Z",
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
    expect(screen.getByText("Kommande möten")).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
    // Cancelled meeting should be filtered out
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
    cancelMutateMock.mockClear();
    render(<MeetingsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Avboka"));
    expect(cancelMutateMock).not.toHaveBeenCalled();
  });

  it("renders loading state", () => {
    useMeetingsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar möten...")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    useMeetingsMock.mockReturnValue({ data: [], isLoading: false });
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga kommande möten.")).toBeInTheDocument();
  });

  it("closes form when cancel callback fires", () => {
    render(<MeetingsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Nytt möte"));
    expect(screen.getByText("Avbryt")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Avbryt"));
    // The form should be gone
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
          meeting_date: "2024-06-01",
          meeting_time: "10:00:00",
          notes: null,
          status: "scheduled",
          reminded_at: null,
          inserted_at: "",
        },
        {
          id: "m2",
          lead_id: "l2",
          user_id: "u1",
          title: "Second",
          meeting_date: "2024-06-01",
          meeting_time: "14:00:00",
          notes: null,
          status: "scheduled",
          reminded_at: null,
          inserted_at: "",
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
          meeting_date: "2024-06-01",
          meeting_time: "10:00:00",
          notes: null,
          status: "completed",
          reminded_at: null,
          inserted_at: "",
        },
      ],
      isLoading: false,
    });
    render(<MeetingsPage />, { wrapper: Wrapper });
    expect(screen.queryByText("Avboka")).not.toBeInTheDocument();
  });
});
