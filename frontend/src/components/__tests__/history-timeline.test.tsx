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

  it("renders call logs with outcome label", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
  });

  it("renders call notes", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.getByText("Called and booked")).toBeInTheDocument();
  });

  it("renders call log with null outcome as 'Samtal'", () => {
    const nullOutcomeLog = { ...callLog, outcome: null as unknown as CallLog["outcome"] };
    render(<HistoryTimeline callLogs={[nullOutcomeLog]} />);
    expect(screen.getByText("Samtal")).toBeInTheDocument();
  });

  it("does not render notes when call has no notes", () => {
    const noNotesLog: CallLog = { ...callLog, notes: null };
    render(<HistoryTimeline callLogs={[noNotesLog]} />);
    expect(screen.queryByText("Called and booked")).not.toBeInTheDocument();
  });

  it("sorts entries by called_at descending", () => {
    const older: CallLog = {
      ...callLog,
      id: "c2",
      outcome: "no_answer",
      called_at: "2024-03-14T09:00:00Z",
    };
    render(<HistoryTimeline callLogs={[older, callLog]} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Möte bokat");
    expect(items[1]!.textContent).toContain("Ej svar");
  });
});
