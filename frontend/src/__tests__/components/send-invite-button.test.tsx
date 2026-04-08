import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SendInviteButton } from "@/components/send-invite-button";

const mutateMock = vi.fn();

vi.mock("@/api/microsoft", () => ({
  useCreateTeamsMeeting: vi.fn(() => ({
    mutate: mutateMock,
    isPending: false,
  })),
}));

const defaultProps = {
  meetingId: "meeting-1",
  teamsJoinUrl: null as string | null,
};

describe("SendInviteButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when teamsJoinUrl is present", () => {
    const { container } = render(
      <SendInviteButton {...defaultProps} teamsJoinUrl="https://teams.microsoft.com/join/123" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders button when teamsJoinUrl is null", () => {
    render(<SendInviteButton {...defaultProps} />);
    expect(screen.getByTestId("send-invite-button")).toBeInTheDocument();
    expect(screen.getByText("Skicka inbjudan")).toBeInTheDocument();
  });

  it("opens modal on click", async () => {
    const user = userEvent.setup();
    render(<SendInviteButton {...defaultProps} />);

    await user.click(screen.getByTestId("send-invite-button"));

    expect(screen.getByTestId("invite-modal")).toBeInTheDocument();
    expect(screen.getByText("Skicka Teams-inbjudan")).toBeInTheDocument();
  });

  it("pre-fills email from leadEmail", async () => {
    const user = userEvent.setup();
    render(<SendInviteButton {...defaultProps} leadEmail="lead@test.se" />);

    await user.click(screen.getByTestId("send-invite-button"));

    const emailInput = screen.getByTestId("invite-email-input") as HTMLInputElement;
    expect(emailInput.value).toBe("lead@test.se");
  });

  it("pre-fills email from attendeeEmail when leadEmail is null", async () => {
    const user = userEvent.setup();
    render(
      <SendInviteButton
        {...defaultProps}
        leadEmail={null}
        attendeeEmail="attendee@test.se"
      />,
    );

    await user.click(screen.getByTestId("send-invite-button"));

    const emailInput = screen.getByTestId("invite-email-input") as HTMLInputElement;
    expect(emailInput.value).toBe("attendee@test.se");
  });

  it("pre-fills name from attendeeName", async () => {
    const user = userEvent.setup();
    render(
      <SendInviteButton
        {...defaultProps}
        attendeeName="Anna Svensson"
        leadName="Karl Karlsson"
      />,
    );

    await user.click(screen.getByTestId("send-invite-button"));

    const nameInput = screen.getByTestId("invite-name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("Anna Svensson");
  });

  it("pre-fills name from leadName when attendeeName is null", async () => {
    const user = userEvent.setup();
    render(
      <SendInviteButton
        {...defaultProps}
        attendeeName={null}
        leadName="Karl Karlsson"
      />,
    );

    await user.click(screen.getByTestId("send-invite-button"));

    const nameInput = screen.getByTestId("invite-name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("Karl Karlsson");
  });

  it("empty fields when no email available", async () => {
    const user = userEvent.setup();
    render(<SendInviteButton {...defaultProps} />);

    await user.click(screen.getByTestId("send-invite-button"));

    const emailInput = screen.getByTestId("invite-email-input") as HTMLInputElement;
    const nameInput = screen.getByTestId("invite-name-input") as HTMLInputElement;
    expect(emailInput.value).toBe("");
    expect(nameInput.value).toBe("");
  });

  it("calls mutation on submit", async () => {
    const user = userEvent.setup();
    render(
      <SendInviteButton
        {...defaultProps}
        leadEmail="lead@test.se"
        attendeeName="Anna Svensson"
      />,
    );

    await user.click(screen.getByTestId("send-invite-button"));
    await user.click(screen.getByTestId("invite-submit-button"));

    expect(mutateMock).toHaveBeenCalledWith(
      {
        meetingId: "meeting-1",
        email: "lead@test.se",
        name: "Anna Svensson",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("closes modal after successful send", async () => {
    mutateMock.mockImplementation((_params: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });

    const user = userEvent.setup();
    const onSent = vi.fn();
    render(
      <SendInviteButton
        {...defaultProps}
        leadEmail="lead@test.se"
        onSent={onSent}
      />,
    );

    await user.click(screen.getByTestId("send-invite-button"));
    expect(screen.getByTestId("invite-modal")).toBeInTheDocument();

    await user.click(screen.getByTestId("invite-submit-button"));

    expect(screen.queryByTestId("invite-modal")).not.toBeInTheDocument();
    expect(onSent).toHaveBeenCalled();
  });

  it("shows read-only date and time when provided", async () => {
    const user = userEvent.setup();
    render(
      <SendInviteButton
        {...defaultProps}
        meetingDate="2026-04-15"
        meetingTime="14:30:00"
      />,
    );

    await user.click(screen.getByTestId("send-invite-button"));

    const datetime = screen.getByTestId("invite-datetime");
    expect(datetime).toBeInTheDocument();
    expect(datetime.textContent).toContain("14:30");
  });

  it("closes modal when overlay is clicked", async () => {
    const user = userEvent.setup();
    render(<SendInviteButton {...defaultProps} />);

    await user.click(screen.getByTestId("send-invite-button"));
    expect(screen.getByTestId("invite-modal")).toBeInTheDocument();

    await user.click(screen.getByTestId("invite-modal-overlay"));

    expect(screen.queryByTestId("invite-modal")).not.toBeInTheDocument();
  });

  it("closes modal when Avbryt is clicked", async () => {
    const user = userEvent.setup();
    render(<SendInviteButton {...defaultProps} />);

    await user.click(screen.getByTestId("send-invite-button"));
    expect(screen.getByTestId("invite-modal")).toBeInTheDocument();

    await user.click(screen.getByText("Avbryt"));

    expect(screen.queryByTestId("invite-modal")).not.toBeInTheDocument();
  });
});
