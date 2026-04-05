import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DealStageIndicator } from "../deal-stage-indicator";

const STAGE_LABELS = [
  "Möte bokat",
  "Behöver hemsida",
  "Genereras",
  "Granskning",
  "Deployad",
  "Demo & uppföljning",
  "Avtal skickat",
  "Signerat",
  "DNS & Lansering",
  "Klar",
];

describe("DealStageIndicator", () => {
  it("renders all stage labels", () => {
    render(<DealStageIndicator currentStage="meeting_booked" />);

    for (const label of STAGE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks completed stages", () => {
    render(<DealStageIndicator currentStage="reviewing" />);

    const steps = screen.getAllByTestId("stage-step");
    expect(steps[0]).toHaveAttribute("data-state", "completed");
    expect(steps[1]).toHaveAttribute("data-state", "completed");
    expect(steps[2]).toHaveAttribute("data-state", "completed");
    expect(steps[3]).toHaveAttribute("data-state", "current");
    expect(steps[4]).toHaveAttribute("data-state", "upcoming");
  });

  it("marks all stages completed when won", () => {
    render(<DealStageIndicator currentStage="won" />);

    const steps = screen.getAllByTestId("stage-step");
    for (const step of steps) {
      expect(step).toHaveAttribute("data-state", "completed");
    }
  });
});
