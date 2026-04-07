import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineEditField } from "@/components/dialer/inline-edit-field";

describe("InlineEditField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the value as text by default", () => {
    render(<InlineEditField value="hello@example.com" onSave={vi.fn()} />);
    expect(screen.getByText("hello@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows input on click", async () => {
    const user = userEvent.setup();
    render(<InlineEditField value="initial value" onSave={vi.fn()} />);

    await user.click(screen.getByText("initial value"));

    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("initial value");
  });

  it("saves on Enter and calls onSave with new value", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<InlineEditField value="old value" onSave={onSave} />);

    await user.click(screen.getByText("old value"));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "new value");
    await user.keyboard("{Enter}");

    expect(onSave).toHaveBeenCalledWith("new value");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("cancels on Escape without saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<InlineEditField value="original" onSave={onSave} />);

    await user.click(screen.getByText("original"));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "discarded");
    await user.keyboard("{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("original")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("saves on blur and calls onSave with new value", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <div>
        <InlineEditField value="blur test" onSave={onSave} />
        <button type="button">Other</button>
      </div>,
    );

    await user.click(screen.getByText("blur test"));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "blurred value");
    await user.click(screen.getByRole("button", { name: "Other" }));

    expect(onSave).toHaveBeenCalledWith("blurred value");
  });

  it("shows placeholder in italic when value is empty", () => {
    render(<InlineEditField value="" onSave={vi.fn()} placeholder="Enter email" />);

    const el = screen.getByText("Enter email");
    expect(el).toBeInTheDocument();
    expect(el.className).toMatch(/italic/);
  });

  it("appends link indicator when isLink is true", () => {
    render(<InlineEditField value="https://example.com" onSave={vi.fn()} isLink />);
    expect(screen.getByText("https://example.com ↗")).toBeInTheDocument();
  });

  it("does not append link indicator when isLink is false", () => {
    render(<InlineEditField value="https://example.com" onSave={vi.fn()} isLink={false} />);
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    expect(screen.queryByText("https://example.com ↗")).not.toBeInTheDocument();
  });

  it("does not call onSave when value is unchanged on blur", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <div>
        <InlineEditField value="unchanged" onSave={onSave} />
        <button type="button">Other</button>
      </div>,
    );

    await user.click(screen.getByText("unchanged"));
    // blur without changing value
    await user.click(screen.getByRole("button", { name: "Other" }));

    expect(onSave).not.toHaveBeenCalled();
  });
});
