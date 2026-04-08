import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SendContractForm } from "@/components/pipeline/send-contract-form";

vi.mock("@/api/contract-admin", () => ({
  useSendContract: vi.fn(),
}));

import { useSendContract } from "@/api/contract-admin";

const mockUseSendContract = vi.mocked(useSendContract);

function makeMutation(overrides: Partial<ReturnType<typeof useSendContract>> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useSendContract>;
}

describe("SendContractForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSendContract.mockReturnValue(makeMutation());
  });

  it("renders with pre-filled email", () => {
    render(<SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName={null} />);
    expect(screen.getByDisplayValue("kund@exempel.se")).toBeInTheDocument();
  });

  it("renders with pre-filled recipient name", () => {
    render(<SendContractForm dealId="deal-1" defaultEmail={null} defaultName="Acme AB" />);
    expect(screen.getByDisplayValue("Acme AB")).toBeInTheDocument();
  });

  it("button disabled when email empty", () => {
    render(<SendContractForm dealId="deal-1" defaultEmail={null} defaultName={null} />);
    const button = screen.getByRole("button", { name: "Skicka avtal" });
    expect(button).toBeDisabled();
  });

  it("button disabled when email has no @", async () => {
    const user = userEvent.setup();
    render(<SendContractForm dealId="deal-1" defaultEmail={null} defaultName={null} />);
    const emailInput = screen.getByPlaceholderText("kund@exempel.se");
    const amountInput = screen.getByPlaceholderText("0");
    await user.type(amountInput, "1000");
    await user.type(emailInput, "notanemail");
    const button = screen.getByRole("button", { name: "Skicka avtal" });
    expect(button).toBeDisabled();
  });

  it("button disabled when amount empty", async () => {
    const user = userEvent.setup();
    render(<SendContractForm dealId="deal-1" defaultEmail={null} defaultName={null} />);
    const emailInput = screen.getByPlaceholderText("kund@exempel.se");
    await user.type(emailInput, "kund@test.se");
    const button = screen.getByRole("button", { name: "Skicka avtal" });
    expect(button).toBeDisabled();
  });

  it("button enabled when email and amount are valid", async () => {
    const user = userEvent.setup();
    render(<SendContractForm dealId="deal-1" defaultEmail={null} defaultName={null} />);
    const emailInput = screen.getByPlaceholderText("kund@exempel.se");
    const amountInput = screen.getByPlaceholderText("0");
    await user.type(emailInput, "kund@test.se");
    await user.type(amountInput, "1000");
    const button = screen.getByRole("button", { name: "Skicka avtal" });
    expect(button).not.toBeDisabled();
  });

  it("button shows 'Skickar...' during mutation", () => {
    mockUseSendContract.mockReturnValue(makeMutation({ isPending: true }));
    render(<SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName={null} />);
    expect(screen.getByRole("button", { name: "Skickar..." })).toBeInTheDocument();
  });

  it("button is disabled during pending mutation", () => {
    mockUseSendContract.mockReturnValue(makeMutation({ isPending: true }));
    render(<SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName={null} />);
    expect(screen.getByRole("button", { name: "Skickar..." })).toBeDisabled();
  });

  it("success message shown after send", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn((_params: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    mockUseSendContract.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(<SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName={null} />);
    await user.type(screen.getByPlaceholderText("0"), "5000");
    await user.click(screen.getByRole("button", { name: "Skicka avtal" }));

    expect(screen.getByText("Avtalet har skickats!")).toBeInTheDocument();
  });

  it("error message shown on failure", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn((_params: unknown, opts: { onError: () => void }) => {
      opts.onError();
    });
    mockUseSendContract.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(<SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName={null} />);
    await user.type(screen.getByPlaceholderText("0"), "5000");
    await user.click(screen.getByRole("button", { name: "Skicka avtal" }));

    expect(screen.getByText("Något gick fel. Försök igen.")).toBeInTheDocument();
  });

  it("compact mode renders smaller button", () => {
    render(<SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName={null} compact />);
    const button = screen.getByRole("button", { name: "Skicka avtal" });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain("text-[13px]");
  });

  it("compact mode shows 'Skickar...' during mutation", () => {
    mockUseSendContract.mockReturnValue(makeMutation({ isPending: true }));
    render(<SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName={null} compact />);
    expect(screen.getByRole("button", { name: "Skickar..." })).toBeInTheDocument();
  });

  it("compact mode shows success message after send", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn((_params: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    mockUseSendContract.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(
      <SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName={null} compact />,
    );
    await user.type(screen.getByPlaceholderText("Pris (SEK)"), "5000");
    await user.click(screen.getByRole("button", { name: "Skicka avtal" }));

    expect(screen.getByText("Avtalet har skickats!")).toBeInTheDocument();
  });

  it("compact mode shows error message on failure", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn((_params: unknown, opts: { onError: () => void }) => {
      opts.onError();
    });
    mockUseSendContract.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(
      <SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName={null} compact />,
    );
    await user.type(screen.getByPlaceholderText("Pris (SEK)"), "5000");
    await user.click(screen.getByRole("button", { name: "Skicka avtal" }));

    expect(screen.getByText("Något gick fel. Försök igen.")).toBeInTheDocument();
  });

  it("calls mutate with recipientName from defaultName", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn();
    mockUseSendContract.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(
      <SendContractForm dealId="deal-1" defaultEmail="kund@exempel.se" defaultName="Acme AB" />,
    );
    await user.type(screen.getByPlaceholderText("0"), "5000");
    await user.click(screen.getByRole("button", { name: "Skicka avtal" }));

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId: "deal-1",
        amount: 5000,
        recipientEmail: "kund@exempel.se",
        recipientName: "Acme AB",
      }),
      expect.any(Object),
    );
  });
});
