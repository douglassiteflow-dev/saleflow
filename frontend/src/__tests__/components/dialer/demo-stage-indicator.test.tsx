import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DemoStageIndicator } from "@/components/dialer/demo-stage-indicator";

describe("DemoStageIndicator", () => {
  it("shows meeting_booked as first active stage", () => {
    render(<DemoStageIndicator stage="meeting_booked" />);
    expect(screen.getByText("1. Möte bokat")).toBeInTheDocument();
  });

  it("shows generating with completed prior stages", () => {
    render(<DemoStageIndicator stage="generating" />);
    expect(screen.getByText("✓ Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("2. Genererar")).toBeInTheDocument();
  });

  it("shows demo_ready with two completed stages", () => {
    render(<DemoStageIndicator stage="demo_ready" />);
    expect(screen.getByText("✓ Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("✓ Genererar")).toBeInTheDocument();
    expect(screen.getByText("3. Demo klar")).toBeInTheDocument();
  });

  it("shows followup as current with all prior completed", () => {
    render(<DemoStageIndicator stage="followup" />);
    expect(screen.getByText("4. Uppföljning")).toBeInTheDocument();
  });
});
