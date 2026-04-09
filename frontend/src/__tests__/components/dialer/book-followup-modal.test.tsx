import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookFollowupModal } from "@/components/dialer/book-followup-modal";

vi.mock("@/api/followup", () => ({
  useBookFollowup: vi.fn(),
  usePreviewFollowupMail: vi.fn(),
}));

vi.mock("@/components/ui/time-select", () => ({
  TimeSelect: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input
      type="time"
      aria-label="Tid"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { useBookFollowup, usePreviewFollowupMail } from "@/api/followup";

const mockBook = vi.mocked(useBookFollowup);
const mockPreview = vi.mocked(usePreviewFollowupMail);

const mutate = vi.fn();

const defaultProps = {
  demoConfigId: "dc-1",
  leadName: "Acme",
  leadEmail: "info@acme.se",
  open: true,
  onClose: vi.fn(),
};

function renderModal(overrides: Partial<typeof defaultProps> = {}) {
  return render(<BookFollowupModal {...defaultProps} {...overrides} />);
}

function setBookReturn(overrides: Partial<ReturnType<typeof useBookFollowup>> = {}) {
  mockBook.mockReturnValue({
    mutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    ...overrides,
  } as unknown as ReturnType<typeof useBookFollowup>);
}

function setPreviewReturn(data: { subject: string; html: string } | undefined, isLoading = false) {
  mockPreview.mockReturnValue({
    data,
    isLoading,
  } as unknown as ReturnType<typeof usePreviewFollowupMail>);
}

async function fillStep1AndAdvance(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
  await user.type(screen.getByLabelText(/tid/i), "14:00");
  await user.click(screen.getByRole("button", { name: /nästa/i }));
}

describe("BookFollowupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBookReturn();
    setPreviewReturn(undefined);
  });

  it("does not render when open is false", () => {
    renderModal({ open: false });
    expect(screen.queryByText(/boka uppföljning med/i)).not.toBeInTheDocument();
  });

  it("renders step 1 with date, time, email, language and message inputs", () => {
    renderModal();
    expect(screen.getByLabelText(/datum/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tid/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/kundens e-post/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/språk/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/personligt meddelande/i)).toBeInTheDocument();
    expect(screen.getByText(/steg 1 av 2/i)).toBeInTheDocument();
  });

  it("auto-fills email from leadEmail prop", () => {
    renderModal();
    const emailInput = screen.getByLabelText(/kundens e-post/i) as HTMLInputElement;
    expect(emailInput.value).toBe("info@acme.se");
  });

  it("leaves email empty when leadEmail is null", () => {
    renderModal({ leadEmail: null });
    const emailInput = screen.getByLabelText(/kundens e-post/i) as HTMLInputElement;
    expect(emailInput.value).toBe("");
  });

  it("defaults language to Swedish", () => {
    renderModal();
    const select = screen.getByLabelText(/språk/i) as HTMLSelectElement;
    expect(select.value).toBe("sv");
  });

  it("disables Nästa until date, time and email are filled", async () => {
    const user = userEvent.setup();
    renderModal({ leadEmail: null });
    const next = screen.getByRole("button", { name: /nästa/i });
    expect(next).toBeDisabled();

    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    expect(next).toBeDisabled();

    await user.type(screen.getByLabelText(/kundens e-post/i), "kund@test.se");
    expect(next).not.toBeDisabled();
  });

  it("advances to step 2 and shows preview", async () => {
    const user = userEvent.setup();
    setPreviewReturn({ subject: "Uppföljning — Acme", html: "<h1>Preview content</h1>" });

    renderModal();
    await fillStep1AndAdvance(user);

    expect(screen.getByText(/Uppföljning — Acme/i)).toBeInTheDocument();
    expect(screen.getByText(/steg 2 av 2/i)).toBeInTheDocument();
  });

  it("sends with Swedish + auto-filled email + default no copy on submit", async () => {
    const user = userEvent.setup();
    setPreviewReturn({ subject: "S", html: "<h1>P</h1>" });

    renderModal();
    await fillStep1AndAdvance(user);
    await user.click(screen.getByRole("button", { name: /skicka/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "dc-1",
        meeting_date: "2026-04-16",
        meeting_time: "14:00:00",
        language: "sv",
        email: "info@acme.se",
        send_copy: false,
      }),
    );
  });

  it("sends with send_copy=true when checkbox is checked", async () => {
    const user = userEvent.setup();
    setPreviewReturn({ subject: "S", html: "<h1>P</h1>" });

    renderModal();
    await user.click(screen.getByLabelText(/skicka en kopia till mig/i));
    await fillStep1AndAdvance(user);
    await user.click(screen.getByRole("button", { name: /skicka/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ send_copy: true }),
    );
  });

  it("sends with English when language changed", async () => {
    const user = userEvent.setup();
    setPreviewReturn({ subject: "Follow-up — Acme", html: "<h1>en</h1>" });

    renderModal();
    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    await user.selectOptions(screen.getByLabelText(/språk/i), "en");
    await user.click(screen.getByRole("button", { name: /nästa/i }));
    await user.click(screen.getByRole("button", { name: /skicka/i }));

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }));
  });

  it("sends with custom email when agent edits it", async () => {
    const user = userEvent.setup();
    setPreviewReturn({ subject: "S", html: "<h1>P</h1>" });

    renderModal();
    const emailInput = screen.getByLabelText(/kundens e-post/i);
    await user.clear(emailInput);
    await user.type(emailInput, "custom@override.se");
    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    await user.click(screen.getByRole("button", { name: /nästa/i }));
    await user.click(screen.getByRole("button", { name: /skicka/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ email: "custom@override.se" }),
    );
  });

  it("trims whitespace from email before sending", async () => {
    const user = userEvent.setup();
    setPreviewReturn({ subject: "S", html: "<h1>P</h1>" });

    renderModal({ leadEmail: null });
    await user.type(screen.getByLabelText(/kundens e-post/i), "  spaces@test.se  ");
    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    await user.click(screen.getByRole("button", { name: /nästa/i }));
    await user.click(screen.getByRole("button", { name: /skicka/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ email: "spaces@test.se" }),
    );
  });

  it("can go back from step 2 to step 1", async () => {
    const user = userEvent.setup();
    setPreviewReturn({ subject: "S", html: "<h1>P</h1>" });

    renderModal();
    await fillStep1AndAdvance(user);
    expect(screen.getByText(/steg 2 av 2/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /tillbaka/i }));
    expect(screen.getByText(/steg 1 av 2/i)).toBeInTheDocument();
  });

  it("closes on success via useEffect", () => {
    const onClose = vi.fn();
    setBookReturn({ isSuccess: true } as never);
    renderModal({ onClose });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows backend error message when booking fails", async () => {
    const user = userEvent.setup();
    setBookReturn({
      isError: true,
      error: new Error("Mailet kunde inte skickas: 401 invalid key"),
    } as never);
    setPreviewReturn({ subject: "S", html: "<h1>P</h1>" });

    renderModal();
    await fillStep1AndAdvance(user);

    expect(screen.getByText(/det gick inte att skicka mailet/i)).toBeInTheDocument();
    expect(screen.getByText(/401 invalid key/i)).toBeInTheDocument();
  });

  it("shows fallback error text when error has no message", async () => {
    const user = userEvent.setup();
    setBookReturn({
      isError: true,
      error: { message: "" } as never,
    } as never);
    setPreviewReturn({ subject: "S", html: "<h1>P</h1>" });

    renderModal();
    await fillStep1AndAdvance(user);

    expect(screen.getByText(/kontrollera microsoft-anslutning/i)).toBeInTheDocument();
  });

  it("closes modal when clicking overlay", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByTestId("book-followup-overlay"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows loading state in step 2 while preview fetches", async () => {
    const user = userEvent.setup();
    setPreviewReturn(undefined, true);

    renderModal();
    await fillStep1AndAdvance(user);

    expect(screen.getByText(/laddar preview/i)).toBeInTheDocument();
  });
});
