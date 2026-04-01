import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OtpInput } from "../otp-input";

describe("OtpInput", () => {
  it("renders 6 digit inputs", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBe(6);
  });

  it("auto-focuses first input", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs[0]).toHaveFocus();
  });

  it("moves focus to next input on digit entry", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.change(inputs[0]!, { target: { value: "1" } });
    expect(inputs[1]).toHaveFocus();
  });

  it("moves focus to previous input on backspace", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.change(inputs[0]!, { target: { value: "1" } });
    fireEvent.change(inputs[1]!, { target: { value: "2" } });
    // Now on input 2, press backspace with empty value
    fireEvent.change(inputs[2]!, { target: { value: "" } });
    fireEvent.keyDown(inputs[2]!, { key: "Backspace" });
    expect(inputs[1]).toHaveFocus();
  });

  it("calls onComplete when all 6 digits filled", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.change(inputs[0]!, { target: { value: "1" } });
    fireEvent.change(inputs[1]!, { target: { value: "2" } });
    fireEvent.change(inputs[2]!, { target: { value: "3" } });
    fireEvent.change(inputs[3]!, { target: { value: "4" } });
    fireEvent.change(inputs[4]!, { target: { value: "5" } });
    fireEvent.change(inputs[5]!, { target: { value: "6" } });

    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("handles paste event", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.paste(inputs[0]!, {
      clipboardData: { getData: () => "654321" },
    });

    expect(onComplete).toHaveBeenCalledWith("654321");
  });

  it("only accepts digits", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.change(inputs[0]!, { target: { value: "a" } });
    expect(inputs[0]).toHaveValue("");
  });

  it("displays error message", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} error="Fel kod" />);
    expect(screen.getByText("Fel kod")).toBeInTheDocument();
  });

  it("renders resend link when onResend provided", () => {
    const onComplete = vi.fn();
    const onResend = vi.fn();
    render(<OtpInput onComplete={onComplete} onResend={onResend} />);
    expect(screen.getByText("Skicka ny kod")).toBeInTheDocument();
  });

  it("calls onResend when resend link is clicked", () => {
    const onComplete = vi.fn();
    const onResend = vi.fn();
    render(<OtpInput onComplete={onComplete} onResend={onResend} />);
    fireEvent.click(screen.getByText("Skicka ny kod"));
    expect(onResend).toHaveBeenCalled();
  });

  it("does not render resend link when onResend is not provided", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    expect(screen.queryByText("Skicka ny kod")).not.toBeInTheDocument();
  });

  it("disables inputs when disabled prop is true", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} disabled />);
    const inputs = screen.getAllByRole("textbox");
    for (const input of inputs) {
      expect(input).toBeDisabled();
    }
  });

  it("does not show error when error is null", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} error={null} />);
    // Should not have any error message elements
    expect(screen.queryByText("Fel kod")).not.toBeInTheDocument();
  });

  it("handles partial paste", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.paste(inputs[0]!, {
      clipboardData: { getData: () => "123" },
    });

    expect(inputs[0]).toHaveValue("1");
    expect(inputs[1]).toHaveValue("2");
    expect(inputs[2]).toHaveValue("3");
    expect(inputs[3]).toHaveValue("");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("clears current digit on backspace", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.change(inputs[0]!, { target: { value: "5" } });
    expect(inputs[0]).toHaveValue("5");

    // Focus back on first input and press backspace
    (inputs[0] as HTMLInputElement).focus();
    fireEvent.keyDown(inputs[0]!, { key: "Backspace" });
    expect(inputs[0]).toHaveValue("");
  });

  it("has aria-label on group", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    expect(screen.getByRole("group", { name: "Engångskod" })).toBeInTheDocument();
  });

  it("has aria-labels on individual inputs", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`Siffra ${i}`)).toBeInTheDocument();
    }
  });
});
