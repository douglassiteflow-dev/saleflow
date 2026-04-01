import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, type BadgeStatus } from "../badge";

const allStatuses: BadgeStatus[] = [
  "new",
  "assigned",
  "callback",
  "meeting_booked",
  "not_interested",
  "quarantine",
  "bad_number",
  "customer",
  "no_answer",
  "scheduled",
  "completed",
  "cancelled",
];

const expectedLabels: Record<BadgeStatus, string> = {
  new: "Ny",
  assigned: "Tilldelad",
  callback: "Återuppringning",
  meeting_booked: "Möte bokat",
  not_interested: "Inte intresserad",
  quarantine: "Karantän",
  bad_number: "Fel nummer",
  customer: "Kund",
  no_answer: "Svarar ej",
  scheduled: "Schemalagd",
  completed: "Genomförd",
  cancelled: "Avbokad",
};

describe("Badge", () => {
  it.each(allStatuses)("renders label for status '%s'", (status) => {
    render(<Badge status={status} />);
    expect(screen.getByText(expectedLabels[status])).toBeInTheDocument();
  });

  it("merges custom className", () => {
    render(<Badge status="new" className="custom" data-testid="badge" />);
    expect(screen.getByTestId("badge").className).toContain("custom");
  });

  it("passes additional HTML attributes", () => {
    render(<Badge status="new" data-testid="my-badge" />);
    expect(screen.getByTestId("my-badge")).toBeInTheDocument();
  });

  it("applies correct style classes for each status", () => {
    const { container } = render(<Badge status="meeting_booked" />);
    const span = container.querySelector("span")!;
    expect(span.className).toContain("bg-emerald-50");
  });
});
