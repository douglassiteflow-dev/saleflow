import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "../stat-card";

describe("StatCard", () => {
  it("renders label and numeric value", () => {
    render(<StatCard label="Samtal idag" value={42} />);
    expect(screen.getByText("Samtal idag")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders string value", () => {
    render(<StatCard label="Status" value="—" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("merges custom className", () => {
    const { container } = render(
      <StatCard label="Test" value={0} className="extra-class" />,
    );
    const card = container.firstElementChild!;
    expect(card.className).toContain("extra-class");
  });
});
