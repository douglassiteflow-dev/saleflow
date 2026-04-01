import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryTimeline } from "../history-timeline";
import type { CallLog, AuditLog } from "@/api/types";

const callLog: CallLog = {
  id: "c1",
  lead_id: "l1",
  user_id: "u1",
  user: { id: "u1", email: "test@test.se", name: "Agent A", role: "agent", active: true, created_at: "", updated_at: "" },
  outcome: "meeting_booked",
  notes: "Called and booked",
  duration_seconds: 120,
  called_at: "2024-03-15T10:00:00Z",
  created_at: "2024-03-15T10:00:00Z",
};

const auditLog: AuditLog = {
  id: "a1",
  lead_id: "l1",
  user_id: "u1",
  user: null,
  action: "lead.created",
  details: { source: "import" },
  created_at: "2024-03-14T09:00:00Z",
};

describe("HistoryTimeline", () => {
  it("shows empty state when no logs", () => {
    render(<HistoryTimeline />);
    expect(screen.getByText("Ingen historik ännu.")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(<HistoryTimeline />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Historik");
  });

  it("renders call logs with outcome label", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
  });

  it("renders call notes", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.getByText("Called and booked")).toBeInTheDocument();
  });

  it("renders user name for call logs", () => {
    render(<HistoryTimeline callLogs={[callLog]} />);
    expect(screen.getByText("av Agent A")).toBeInTheDocument();
  });

  it("renders audit logs with action", () => {
    render(<HistoryTimeline auditLogs={[auditLog]} />);
    expect(screen.getByText("lead.created")).toBeInTheDocument();
  });

  it("renders audit log details as JSON", () => {
    render(<HistoryTimeline auditLogs={[auditLog]} />);
    expect(screen.getByText('{"source":"import"}')).toBeInTheDocument();
  });

  it("sorts entries by timestamp descending", () => {
    render(<HistoryTimeline callLogs={[callLog]} auditLogs={[auditLog]} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    // Call log (2024-03-15) should come before audit log (2024-03-14) since desc
    expect(items[0]!.textContent).toContain("Möte bokat");
    expect(items[1]!.textContent).toContain("lead.created");
  });

  it("renders call log with null outcome as 'Samtal'", () => {
    const nullOutcomeLog: CallLog = { ...callLog, outcome: null };
    render(<HistoryTimeline callLogs={[nullOutcomeLog]} />);
    expect(screen.getByText("Samtal")).toBeInTheDocument();
  });

  it("does not render notes when call has no notes", () => {
    const noNotesLog: CallLog = { ...callLog, notes: null };
    render(<HistoryTimeline callLogs={[noNotesLog]} />);
    expect(screen.queryByText("Called and booked")).not.toBeInTheDocument();
  });

  it("skips details display when audit has null details", () => {
    const noDetailsLog: AuditLog = { ...auditLog, details: null };
    render(<HistoryTimeline auditLogs={[noDetailsLog]} />);
    expect(screen.queryByText('{"source":"import"}')).not.toBeInTheDocument();
  });

  it("skips details display when audit has empty details", () => {
    const emptyDetailsLog: AuditLog = { ...auditLog, details: {} };
    render(<HistoryTimeline auditLogs={[emptyDetailsLog]} />);
    expect(screen.queryByText("{}")).not.toBeInTheDocument();
  });

  it("does not show user for call without user", () => {
    const noUserLog: CallLog = { ...callLog, user: undefined };
    render(<HistoryTimeline callLogs={[noUserLog]} />);
    expect(screen.queryByText("av Agent A")).not.toBeInTheDocument();
  });
});
