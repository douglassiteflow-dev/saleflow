import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryTimeline } from "../history-timeline";
import type { CallLog, AuditLog } from "@/api/types";

const callLog: CallLog = {
  id: "c1",
  lead_id: "l1",
  user_id: "u1",
  outcome: "meeting_booked",
  notes: "Called and booked",
  called_at: "2024-03-15T10:00:00Z",
};

const auditLog: AuditLog = {
  id: "a1",
  user_id: "u1",
  action: "lead.created",
  resource_type: "lead",
  resource_id: "l1",
  changes: { source: { from: "", to: "import" } },
  metadata: {},
  inserted_at: "2024-03-14T09:00:00Z",
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

  it("renders audit logs with action", () => {
    render(<HistoryTimeline auditLogs={[auditLog]} />);
    expect(screen.getByText("lead.created")).toBeInTheDocument();
  });

  it("renders audit log changes as JSON", () => {
    render(<HistoryTimeline auditLogs={[auditLog]} />);
    expect(screen.getByText(JSON.stringify(auditLog.changes))).toBeInTheDocument();
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
    const nullOutcomeLog = { ...callLog, outcome: null as unknown as CallLog["outcome"] };
    render(<HistoryTimeline callLogs={[nullOutcomeLog]} />);
    expect(screen.getByText("Samtal")).toBeInTheDocument();
  });

  it("does not render notes when call has no notes", () => {
    const noNotesLog: CallLog = { ...callLog, notes: null };
    render(<HistoryTimeline callLogs={[noNotesLog]} />);
    expect(screen.queryByText("Called and booked")).not.toBeInTheDocument();
  });

  it("skips changes display when audit has empty changes", () => {
    const emptyChangesLog: AuditLog = { ...auditLog, changes: {} as AuditLog["changes"] };
    render(<HistoryTimeline auditLogs={[emptyChangesLog]} />);
    expect(screen.queryByText("{}")).not.toBeInTheDocument();
  });
});
