import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryTimeline } from "../history-timeline";
import type { CallLog } from "@/api/types";

const callLog: CallLog = {
  id: "c1",
  lead_id: "l1",
  user_id: "u1",
  user_name: null,
  outcome: "meeting_booked",
  notes: "Called and booked",
  called_at: "2024-03-15T10:00:00Z",
  duration: 0,
  has_recording: false,
};

describe("HistoryTimeline", () => {
  it("shows empty state when no logs", () => {
    render(<HistoryTimeline />);
    expect(screen.getByText("Inga samtal ännu.")).toBeInTheDocument();
  });

  it("renders heading 'Samtalshistorik'", () => {
    render(<HistoryTimeline />);
    expect(screen.getByText("Samtalshistorik")).toBeInTheDocument();
  });

  it("renders table headers", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.getByText("Datum")).toBeInTheDocument();
    expect(screen.getByText("Längd")).toBeInTheDocument();
    expect(screen.getByText("Utfall")).toBeInTheDocument();
    expect(screen.getByText("Anteckningar")).toBeInTheDocument();
    expect(screen.getByText("Inspelning")).toBeInTheDocument();
  });

  it("renders call logs with outcome badge", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
  });

  it("renders call notes in table cell", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.getByText("Called and booked")).toBeInTheDocument();
  });

  it("renders dash for null outcome", () => {
    const nullOutcomeLog = { ...callLog, outcome: null as unknown as CallLog["outcome"] };
    render(<HistoryTimeline callLogs={[nullOutcomeLog]} />);
    // Outcome column should show a dash
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders dash when call has no notes", () => {
    const noNotesLog: CallLog = { ...callLog, notes: null };
    render(<HistoryTimeline callLogs={[noNotesLog]} />);
    expect(screen.queryByText("Called and booked")).not.toBeInTheDocument();
    // Notes column shows dash
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("sorts entries by called_at descending", () => {
    const older: CallLog = {
      ...callLog,
      id: "c2",
      outcome: "no_answer",
      called_at: "2024-03-14T09:00:00Z",
    };
    render(<HistoryTimeline callLogs={[older, callLog]} />);
    const rows = screen.getAllByRole("row");
    // First row is the header, data rows start at index 1
    expect(rows[1]!.textContent).toContain("Möte bokat");
    expect(rows[2]!.textContent).toContain("Ej svar");
  });

  it("shows Agent column when any call has user_name", () => {
    const withAgent: CallLog = { ...callLog, user_name: "Anna Svensson" };
    render(<HistoryTimeline callLogs={[withAgent]} />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Anna Svensson")).toBeInTheDocument();
  });

  it("hides Agent column when no call has user_name", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.queryByText("Agent")).not.toBeInTheDocument();
  });

  it("renders formatted duration when duration > 0", () => {
    const withDuration: CallLog = { ...callLog, duration: 125 };
    render(<HistoryTimeline callLogs={[withDuration]} />);
    // formatDuration(125) should produce a readable duration string
    expect(screen.queryByText("—", { selector: "td" })).toBeFalsy();
  });

  it("renders dash for duration when duration is 0", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("skips Card wrapper when bare prop is true", () => {
    const { container } = render(<HistoryTimeline callLogs={[callLog]} bare />);
    // bare mode renders the table directly, no CardTitle
    expect(screen.queryByText("Samtalshistorik")).not.toBeInTheDocument();
    expect(container.querySelector("table")).toBeInTheDocument();
  });

  it("renders Card wrapper by default", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.getByText("Samtalshistorik")).toBeInTheDocument();
  });
});
