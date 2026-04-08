import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SendQuestionnaireForm } from "@/components/pipeline/send-questionnaire-form";

vi.mock("@/api/questionnaire-admin", () => ({
  useSendQuestionnaire: vi.fn(),
}));

import { useSendQuestionnaire } from "@/api/questionnaire-admin";

const mockUseSendQuestionnaire = vi.mocked(useSendQuestionnaire);

function makeMutation(overrides: Partial<ReturnType<typeof useSendQuestionnaire>> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useSendQuestionnaire>;
}

describe("SendQuestionnaireForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSendQuestionnaire.mockReturnValue(makeMutation());
  });

  it("renders with pre-filled email", () => {
    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" />);
    expect(screen.getByDisplayValue("kund@exempel.se")).toBeInTheDocument();
  });

  it("button disabled when email empty", () => {
    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail={null} />);
    const button = screen.getByRole("button", { name: "Skicka formulär" });
    expect(button).toBeDisabled();
  });

  it("button disabled when email has no @", async () => {
    const user = userEvent.setup();
    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail={null} />);
    const input = screen.getByPlaceholderText("kund@exempel.se");
    await user.type(input, "notanemail");
    const button = screen.getByRole("button", { name: "Skicka formulär" });
    expect(button).toBeDisabled();
  });

  it("button enabled when email contains @", async () => {
    const user = userEvent.setup();
    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail={null} />);
    const input = screen.getByPlaceholderText("kund@exempel.se");
    await user.type(input, "kund@test.se");
    const button = screen.getByRole("button", { name: "Skicka formulär" });
    expect(button).not.toBeDisabled();
  });

  it("button shows 'Skickar...' during mutation", () => {
    mockUseSendQuestionnaire.mockReturnValue(makeMutation({ isPending: true }));
    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" />);
    expect(screen.getByRole("button", { name: "Skickar..." })).toBeInTheDocument();
  });

  it("button is disabled during pending mutation", () => {
    mockUseSendQuestionnaire.mockReturnValue(makeMutation({ isPending: true }));
    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" />);
    expect(screen.getByRole("button", { name: "Skickar..." })).toBeDisabled();
  });

  it("success message shown after send", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn((_params: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    mockUseSendQuestionnaire.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" />);
    await user.click(screen.getByRole("button", { name: "Skicka formulär" }));

    expect(screen.getByText("Formuläret har skickats!")).toBeInTheDocument();
  });

  it("error message shown on failure", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn((_params: unknown, opts: { onError: () => void }) => {
      opts.onError();
    });
    mockUseSendQuestionnaire.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" />);
    await user.click(screen.getByRole("button", { name: "Skicka formulär" }));

    expect(screen.getByText("Något gick fel. Försök igen.")).toBeInTheDocument();
  });

  it("compact mode renders smaller button", () => {
    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" compact />);
    const button = screen.getByRole("button", { name: "Skicka formulär" });
    expect(button).toBeInTheDocument();
    // compact uses <button> element (not Button component), check text-[13px] class
    expect(button.className).toContain("text-[13px]");
  });

  it("compact mode shows 'Skickar...' during mutation", () => {
    mockUseSendQuestionnaire.mockReturnValue(makeMutation({ isPending: true }));
    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" compact />);
    expect(screen.getByRole("button", { name: "Skickar..." })).toBeInTheDocument();
  });

  it("compact mode shows success message after send", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn((_params: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    mockUseSendQuestionnaire.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" compact />);
    await user.click(screen.getByRole("button", { name: "Skicka formulär" }));

    expect(screen.getByText("Formuläret har skickats!")).toBeInTheDocument();
  });

  it("compact mode shows error message on failure", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn((_params: unknown, opts: { onError: () => void }) => {
      opts.onError();
    });
    mockUseSendQuestionnaire.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" compact />);
    await user.click(screen.getByRole("button", { name: "Skicka formulär" }));

    expect(screen.getByText("Något gick fel. Försök igen.")).toBeInTheDocument();
  });

  it("calls mutate with correct params", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn();
    mockUseSendQuestionnaire.mockReturnValue(makeMutation({ mutate: mutateFn }));

    render(<SendQuestionnaireForm dealId="deal-1" defaultEmail="kund@exempel.se" />);
    await user.click(screen.getByRole("button", { name: "Skicka formulär" }));

    expect(mutateFn).toHaveBeenCalledWith(
      { dealId: "deal-1", customerEmail: "kund@exempel.se" },
      expect.any(Object),
    );
  });
});
