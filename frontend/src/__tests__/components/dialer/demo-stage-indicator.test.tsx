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

  it("renders cancelled with no stage highlighted as current or completed", () => {
    render(<DemoStageIndicator stage="cancelled" />);

    // cancelled has ORDER -1, so currentIdx = -1
    // No stage is current (i === -1 is never true for i>=0)
    // No stage is completed (i < -1 is never true for i>=0)
    // All stages rendered as plain labels (no prefix)
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Genererar")).toBeInTheDocument();
    expect(screen.getByText("Demo klar")).toBeInTheDocument();
    expect(screen.getByText("Uppföljning")).toBeInTheDocument();
  });

  it("renders separators between stages", () => {
    render(<DemoStageIndicator stage="meeting_booked" />);
    // There should be 3 separators (between 4 stages)
    const separators = screen.getAllByText("—");
    expect(separators).toHaveLength(3);
  });

  it("handles unknown stage gracefully via nullish coalescing fallback", () => {
    // Force an unknown stage to exercise the ?? -1 fallback on line 24
    render(<DemoStageIndicator stage={"unknown_stage" as never} />);

    // With currentIdx = -1, no stage is current or completed — all rendered as plain labels
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Genererar")).toBeInTheDocument();
    expect(screen.getByText("Demo klar")).toBeInTheDocument();
    expect(screen.getByText("Uppföljning")).toBeInTheDocument();
  });
});
