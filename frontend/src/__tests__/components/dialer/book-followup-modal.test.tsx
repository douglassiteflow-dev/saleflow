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

describe("BookFollowupModal", () => {
  const mutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockBook.mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: false,
    } as unknown as ReturnType<typeof useBookFollowup>);
    mockPreview.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof usePreviewFollowupMail>);
  });

  it("does not render when open is false", () => {
    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={false} onClose={vi.fn()} />,
    );
    expect(screen.queryByText(/boka uppföljning med/i)).not.toBeInTheDocument();
  });

  it("renders step 1 with date, time, language and message inputs", () => {
    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText(/datum/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tid/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/språk/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/personligt meddelande/i)).toBeInTheDocument();
    expect(screen.getByText(/steg 1 av 2/i)).toBeInTheDocument();
  });

  it("defaults language to Swedish", () => {
    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={vi.fn()} />,
    );
    const select = screen.getByLabelText(/språk/i) as HTMLSelectElement;
    expect(select.value).toBe("sv");
  });

  it("disables Nästa until date and time are filled", async () => {
    const user = userEvent.setup();
    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={vi.fn()} />,
    );
    const next = screen.getByRole("button", { name: /nästa/i });
    expect(next).toBeDisabled();

    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    expect(next).not.toBeDisabled();
  });

  it("advances to step 2 and shows preview", async () => {
    const user = userEvent.setup();
    mockPreview.mockReturnValue({
      data: { subject: "Uppföljning — Acme", html: "<h1>Preview content</h1>" },
      isLoading: false,
    } as unknown as ReturnType<typeof usePreviewFollowupMail>);

    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    await user.click(screen.getByRole("button", { name: /nästa/i }));

    expect(screen.getByText(/Uppföljning — Acme/i)).toBeInTheDocument();
    expect(screen.getByText(/steg 2 av 2/i)).toBeInTheDocument();
  });

  it("sends with Swedish when submit clicked", async () => {
    const user = userEvent.setup();
    mockPreview.mockReturnValue({
      data: { subject: "S", html: "<h1>P</h1>" },
      isLoading: false,
    } as unknown as ReturnType<typeof usePreviewFollowupMail>);

    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    await user.click(screen.getByRole("button", { name: /nästa/i }));
    await user.click(screen.getByRole("button", { name: /skicka/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "dc-1",
        meeting_date: "2026-04-16",
        meeting_time: "14:00:00",
        language: "sv",
      }),
    );
  });

  it("sends with English when language changed", async () => {
    const user = userEvent.setup();
    mockPreview.mockReturnValue({
      data: { subject: "Follow-up — Acme", html: "<h1>en</h1>" },
      isLoading: false,
    } as unknown as ReturnType<typeof usePreviewFollowupMail>);

    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    await user.selectOptions(screen.getByLabelText(/språk/i), "en");
    await user.click(screen.getByRole("button", { name: /nästa/i }));
    await user.click(screen.getByRole("button", { name: /skicka/i }));

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }));
  });

  it("can go back from step 2 to step 1", async () => {
    const user = userEvent.setup();
    mockPreview.mockReturnValue({
      data: { subject: "S", html: "<h1>P</h1>" },
      isLoading: false,
    } as unknown as ReturnType<typeof usePreviewFollowupMail>);

    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    await user.click(screen.getByRole("button", { name: /nästa/i }));
    expect(screen.getByText(/steg 2 av 2/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /tillbaka/i }));
    expect(screen.getByText(/steg 1 av 2/i)).toBeInTheDocument();
  });

  it("closes on success via useEffect", () => {
    const onClose = vi.fn();
    mockBook.mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: true,
      isError: false,
    } as unknown as ReturnType<typeof useBookFollowup>);

    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={onClose} />,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error when booking fails", async () => {
    const user = userEvent.setup();
    mockBook.mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: true,
    } as unknown as ReturnType<typeof useBookFollowup>);
    mockPreview.mockReturnValue({
      data: { subject: "S", html: "<h1>P</h1>" },
      isLoading: false,
    } as unknown as ReturnType<typeof usePreviewFollowupMail>);

    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    await user.click(screen.getByRole("button", { name: /nästa/i }));

    expect(screen.getByText(/kontrollera att du har en microsoft-anslutning/i)).toBeInTheDocument();
  });

  it("closes modal when clicking overlay", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={onClose} />,
    );

    await user.click(screen.getByTestId("book-followup-overlay"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows loading state in step 2 while preview fetches", async () => {
    const user = userEvent.setup();
    mockPreview.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof usePreviewFollowupMail>);

    render(
      <BookFollowupModal demoConfigId="dc-1" leadName="Acme" open={true} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText(/datum/i), "2026-04-16");
    await user.type(screen.getByLabelText(/tid/i), "14:00");
    await user.click(screen.getByRole("button", { name: /nästa/i }));

    expect(screen.getByText(/laddar preview/i)).toBeInTheDocument();
  });
});
