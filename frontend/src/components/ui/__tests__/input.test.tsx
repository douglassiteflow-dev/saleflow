import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "../input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input data-testid="test-input" />);
    expect(screen.getByTestId("test-input")).toBeInTheDocument();
    expect(screen.getByTestId("test-input").tagName).toBe("INPUT");
  });

  it("merges custom className", () => {
    render(<Input className="custom-class" data-testid="test-input" />);
    expect(screen.getByTestId("test-input").className).toContain("custom-class");
  });

  it("handles value and onChange", () => {
    const onChange = vi.fn();
    render(<Input value="test" onChange={onChange} data-testid="test-input" />);
    expect(screen.getByTestId("test-input")).toHaveValue("test");
    fireEvent.change(screen.getByTestId("test-input"), { target: { value: "new" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("can be disabled", () => {
    render(<Input disabled data-testid="test-input" />);
    expect(screen.getByTestId("test-input")).toBeDisabled();
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(<Input ref={ref} />);
    expect(ref).toHaveBeenCalled();
  });

  it("has displayName", () => {
    expect(Input.displayName).toBe("Input");
  });

  it("accepts placeholder", () => {
    render(<Input placeholder="Enter text" data-testid="test-input" />);
    expect(screen.getByTestId("test-input")).toHaveAttribute("placeholder", "Enter text");
  });

  it("accepts type prop", () => {
    render(<Input type="email" data-testid="test-input" />);
    expect(screen.getByTestId("test-input")).toHaveAttribute("type", "email");
  });
});
