import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardTitle } from "../card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies default styles", () => {
    render(<Card data-testid="card">Content</Card>);
    expect(screen.getByTestId("card").className).toContain("rounded-lg");
  });

  it("merges custom className", () => {
    render(<Card className="custom-class" data-testid="card">Content</Card>);
    expect(screen.getByTestId("card").className).toContain("custom-class");
  });

  it("passes additional HTML attributes", () => {
    render(<Card data-testid="card" id="my-card">Content</Card>);
    expect(screen.getByTestId("card")).toHaveAttribute("id", "my-card");
  });
});

describe("CardTitle", () => {
  it("renders children as h3", () => {
    render(<CardTitle>Title</CardTitle>);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("Title");
  });

  it("merges custom className", () => {
    render(<CardTitle className="custom-class">Title</CardTitle>);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.className).toContain("custom-class");
  });

  it("passes additional HTML attributes", () => {
    render(<CardTitle data-testid="title">Title</CardTitle>);
    expect(screen.getByTestId("title")).toBeInTheDocument();
  });
});
