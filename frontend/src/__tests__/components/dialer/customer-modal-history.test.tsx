import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CustomerModalHistory } from "@/components/dialer/customer-modal-history";
import type { CallLog } from "@/api/types";

vi.mock("@/components/recording-player", () => ({
  RecordingPlayer: ({ phoneCallId }: { phoneCallId: string }) => (
    <div data-testid={`recording-player-${phoneCallId}`}>RecordingPlayer</div>
  ),
}));

const SAMPLE_CALLS: CallLog[] = [
  {
    id: "call-1",
    lead_id: "lead-1",
    user_id: "user-1",
    user_name: "Anna Svensson",
    outcome: "meeting_booked",
    notes: "Bokat möte nästa vecka",
    called_at: "2026-04-07T14:30:00",
    duration: 185,
    has_recording: true,
    phone_call_id: "pc-1",
  },
  {
    id: "call-2",
    lead_id: "lead-1",
    user_id: "user-2",
    user_name: "Erik Johansson",
    outcome: "no_answer",
    notes: null,
    called_at: "2026-04-05T09:15:00",
    duration: 12,
    has_recording: false,
    phone_call_id: null,
  },
  {
    id: "call-3",
    lead_id: "lead-1",
    user_id: "user-1",
    user_name: "Anna Svensson",
    outcome: "callback",
    notes: "Ring tillbaka på fredag",
    called_at: "2026-04-03T16:45:00",
    duration: 90,
    has_recording: true,
    phone_call_id: "pc-3",
  },
];

describe("CustomerModalHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders call history entries", () => {
    render(<CustomerModalHistory calls={SAMPLE_CALLS} />);

    const annaEntries = screen.getAllByText("Anna Svensson");
    expect(annaEntries).toHaveLength(2);
    expect(screen.getByText("Erik Johansson")).toBeInTheDocument();
  });

  it("shows date in Swedish format and outcome badge", () => {
    render(<CustomerModalHistory calls={SAMPLE_CALLS} />);

    expect(screen.getByText("7 april 2026, 14:30")).toBeInTheDocument();
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
  });

  it("shows all outcome badges with correct labels", () => {
    render(<CustomerModalHistory calls={SAMPLE_CALLS} />);

    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Ej svar")).toBeInTheDocument();
    expect(screen.getByText("Återuppringning")).toBeInTheDocument();
  });

  it("shows agent name and duration in MM:SS format", () => {
    render(<CustomerModalHistory calls={SAMPLE_CALLS} />);

    // call-1: 185s = 03:05
    expect(screen.getByText("03:05")).toBeInTheDocument();
    // call-2: 12s = 00:12
    expect(screen.getByText("00:12")).toBeInTheDocument();
    // call-3: 90s = 01:30
    expect(screen.getByText("01:30")).toBeInTheDocument();
  });

  it("shows recording player when has_recording and phone_call_id", () => {
    render(<CustomerModalHistory calls={SAMPLE_CALLS} />);

    // call-1 has recording
    expect(screen.getByTestId("recording-player-pc-1")).toBeInTheDocument();
    // call-3 has recording
    expect(screen.getByTestId("recording-player-pc-3")).toBeInTheDocument();
  });

  it("does not show recording player when has_recording is false", () => {
    render(<CustomerModalHistory calls={SAMPLE_CALLS} />);

    // call-2 has no recording
    expect(screen.queryByTestId("recording-player-null")).not.toBeInTheDocument();
  });

  it("does not show recording player when phone_call_id is null", () => {
    const callWithRecordingButNoId: CallLog[] = [
      {
        id: "call-x",
        lead_id: "lead-1",
        user_id: "user-1",
        user_name: "Test",
        outcome: "no_answer",
        notes: null,
        called_at: "2026-04-07T10:00:00",
        duration: 5,
        has_recording: true,
        phone_call_id: null,
      },
    ];

    render(<CustomerModalHistory calls={callWithRecordingButNoId} />);

    expect(screen.queryByText("RecordingPlayer")).not.toBeInTheDocument();
  });

  it("shows notes when present", () => {
    render(<CustomerModalHistory calls={SAMPLE_CALLS} />);

    expect(screen.getByText("Bokat möte nästa vecka")).toBeInTheDocument();
    expect(screen.getByText("Ring tillbaka på fredag")).toBeInTheDocument();
  });

  it("does not render notes panel when notes is null", () => {
    const callNoNotes: CallLog[] = [
      {
        id: "call-nn",
        lead_id: "lead-1",
        user_id: "user-1",
        user_name: "Agent",
        outcome: "no_answer",
        notes: null,
        called_at: "2026-04-07T10:00:00",
        duration: 10,
        has_recording: false,
      },
    ];

    const { container } = render(<CustomerModalHistory calls={callNoNotes} />);

    // Only the date row, meta row, and no notes/recording panels
    const panels = container.querySelectorAll(".bg-\\[var\\(--color-bg-panel\\)\\]");
    expect(panels).toHaveLength(0);
  });

  it("shows empty state when calls array is empty", () => {
    render(<CustomerModalHistory calls={[]} />);

    expect(screen.getByText("Ingen samtalshistorik")).toBeInTheDocument();
  });

  it("does not show empty state when calls exist", () => {
    render(<CustomerModalHistory calls={SAMPLE_CALLS} />);

    expect(screen.queryByText("Ingen samtalshistorik")).not.toBeInTheDocument();
  });

  it("renders dates for all call entries", () => {
    render(<CustomerModalHistory calls={SAMPLE_CALLS} />);

    expect(screen.getByText("7 april 2026, 14:30")).toBeInTheDocument();
    expect(screen.getByText("5 april 2026, 09:15")).toBeInTheDocument();
    expect(screen.getByText("3 april 2026, 16:45")).toBeInTheDocument();
  });

  it("renders outcome badges with correct styling classes", () => {
    const singleCall: CallLog[] = [
      {
        id: "call-style",
        lead_id: "lead-1",
        user_id: "user-1",
        user_name: "Agent",
        outcome: "meeting_booked",
        notes: null,
        called_at: "2026-04-07T10:00:00",
        duration: 60,
        has_recording: false,
      },
    ];

    render(<CustomerModalHistory calls={singleCall} />);

    const badge = screen.getByText("Möte bokat");
    expect(badge).toHaveClass("border-emerald-300");
    expect(badge).toHaveClass("bg-emerald-50");
    expect(badge).toHaveClass("text-emerald-700");
  });

  it("renders recording container with purple background styling", () => {
    const callWithRecording: CallLog[] = [
      {
        id: "call-rec",
        lead_id: "lead-1",
        user_id: "user-1",
        user_name: "Agent",
        outcome: "no_answer",
        notes: null,
        called_at: "2026-04-07T10:00:00",
        duration: 30,
        has_recording: true,
        phone_call_id: "pc-rec",
      },
    ];

    const { container } = render(<CustomerModalHistory calls={callWithRecording} />);

    const recordingContainer = container.querySelector(".bg-\\[\\#EEF2FF\\]");
    expect(recordingContainer).toBeInTheDocument();
    expect(recordingContainer).toHaveClass("border-[#C7D2FE]");
  });

  it("renders all outcome types correctly", () => {
    const allOutcomeCalls: CallLog[] = [
      { id: "c1", lead_id: "l1", user_id: "u1", user_name: "A", outcome: "meeting_booked", notes: null, called_at: "2026-04-07T10:00:00", duration: 10, has_recording: false },
      { id: "c2", lead_id: "l1", user_id: "u1", user_name: "A", outcome: "callback", notes: null, called_at: "2026-04-07T11:00:00", duration: 10, has_recording: false },
      { id: "c3", lead_id: "l1", user_id: "u1", user_name: "A", outcome: "not_interested", notes: null, called_at: "2026-04-07T12:00:00", duration: 10, has_recording: false },
      { id: "c4", lead_id: "l1", user_id: "u1", user_name: "A", outcome: "no_answer", notes: null, called_at: "2026-04-07T13:00:00", duration: 10, has_recording: false },
      { id: "c5", lead_id: "l1", user_id: "u1", user_name: "A", outcome: "call_later", notes: null, called_at: "2026-04-07T14:00:00", duration: 10, has_recording: false },
      { id: "c6", lead_id: "l1", user_id: "u1", user_name: "A", outcome: "bad_number", notes: null, called_at: "2026-04-07T15:00:00", duration: 10, has_recording: false },
    ];

    render(<CustomerModalHistory calls={allOutcomeCalls} />);

    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Återuppringning")).toBeInTheDocument();
    expect(screen.getByText("Ej intresserad")).toBeInTheDocument();
    expect(screen.getByText("Ej svar")).toBeInTheDocument();
    expect(screen.getByText("Ring senare")).toBeInTheDocument();
    expect(screen.getByText("Fel nummer")).toBeInTheDocument();
  });
});
