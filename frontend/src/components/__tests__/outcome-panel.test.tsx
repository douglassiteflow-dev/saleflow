import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OutcomePanel } from "../outcome-panel";

// Mock the useSubmitOutcome hook
const mutateMock = vi.fn();
const useSubmitOutcomeMock = vi.fn();
vi.mock("@/api/leads", () => ({
  useSubmitOutcome: () => useSubmitOutcomeMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("OutcomePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSubmitOutcomeMock.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    });
  });

  it("renders all outcome buttons", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("Återuppringning")).toBeInTheDocument();
    expect(screen.getByText("Inte intresserad")).toBeInTheDocument();
    expect(screen.getByText("Svarar ej")).toBeInTheDocument();
    expect(screen.getByText("Fel nummer")).toBeInTheDocument();
    expect(screen.getByText("Kund")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Utfall");
  });

  it("shows hint text when no outcome selected", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });
    expect(screen.getByText(/Välj ett utfall ovan/)).toBeInTheDocument();
  });

  it("selects outcome on first click, confirms on second click", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });

    const btn = screen.getByText("Svarar ej");
    fireEvent.click(btn);
    expect(screen.getByText("Bekräfta: Svarar ej")).toBeInTheDocument();

    // Second click triggers submit
    fireEvent.click(screen.getByText("Bekräfta: Svarar ej"));
    expect(mutateMock).toHaveBeenCalled();
  });

  it("shows callback date field when callback selected", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Återuppringning"));
    expect(screen.getByText("Datum för återuppringning")).toBeInTheDocument();
  });

  it("shows meeting date and time fields when meeting_booked selected", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Möte bokat"));
    expect(screen.getByText("Mötesdatum")).toBeInTheDocument();
    expect(screen.getByText("Mötestid")).toBeInTheDocument();
  });

  it("shows error when meeting_booked but no date/time", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });

    // First click selects
    fireEvent.click(screen.getByText("Möte bokat"));
    // Second click attempts submit without date/time
    fireEvent.click(screen.getByText("Bekräfta: Möte bokat"));
    expect(screen.getByText("Välj datum och tid för mötet.")).toBeInTheDocument();
  });

  it("renders notes textarea", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });
    expect(screen.getByPlaceholderText("Valfria anteckningar...")).toBeInTheDocument();
  });

  it("calls onOutcomeSubmitted on success", async () => {
    const onSubmitted = vi.fn();
    mutateMock.mockImplementation((_params: unknown, opts: { onSuccess?: () => void }) => {
      opts.onSuccess?.();
    });

    render(<OutcomePanel leadId="1" onOutcomeSubmitted={onSubmitted} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Svarar ej"));
    fireEvent.click(screen.getByText("Bekräfta: Svarar ej"));

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalled();
    });
  });

  it("displays error message on submit failure", async () => {
    mutateMock.mockImplementation((_params: unknown, opts: { onError?: (err: Error) => void }) => {
      opts.onError?.(new Error("Server error"));
    });

    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Svarar ej"));
    fireEvent.click(screen.getByText("Bekräfta: Svarar ej"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("submits callback with date when provided", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Återuppringning"));

    // Fill callback date using the datetime-local input
    const dateInput = document.querySelector('input[type="datetime-local"]')!;
    fireEvent.change(dateInput, { target: { value: "2024-06-01T10:00" } });

    // Confirm
    fireEvent.click(screen.getByText("Bekräfta: Återuppringning"));
    expect(mutateMock).toHaveBeenCalled();
    const callArgs = mutateMock.mock.calls[0]![0] as { callback_at: string };
    expect(callArgs.callback_at).toBe("2024-06-01T10:00");
  });

  it("submits meeting with date and time", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Möte bokat"));

    // Fill meeting date and time using specific input types
    const dateInput = document.querySelector('input[type="date"]')!;
    const timeInput = document.querySelector('input[type="time"]')!;
    fireEvent.change(dateInput, { target: { value: "2024-06-01" } });
    fireEvent.change(timeInput, { target: { value: "14:00" } });

    // Confirm
    fireEvent.click(screen.getByText("Bekräfta: Möte bokat"));
    expect(mutateMock).toHaveBeenCalled();
  });

  it("disables buttons when isPending", () => {
    useSubmitOutcomeMock.mockReturnValue({
      mutate: mutateMock,
      isPending: true,
    });

    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });
    // All outcome buttons should be disabled
    const buttons = screen.getAllByRole("button");
    buttons.forEach(btn => expect(btn).toBeDisabled());
  });

  it("shows fallback error message when error has no message", async () => {
    mutateMock.mockImplementation((_params: unknown, opts: { onError?: (err: { message?: string }) => void }) => {
      opts.onError?.({});
    });

    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Svarar ej"));
    fireEvent.click(screen.getByText("Bekräfta: Svarar ej"));

    await waitFor(() => {
      expect(screen.getByText("Något gick fel.")).toBeInTheDocument();
    });
  });

  it("includes notes in submission when filled", () => {
    render(<OutcomePanel leadId="1" />, { wrapper: Wrapper });

    const textarea = screen.getByPlaceholderText("Valfria anteckningar...");
    fireEvent.change(textarea, { target: { value: "Test notes" } });

    fireEvent.click(screen.getByText("Svarar ej"));
    fireEvent.click(screen.getByText("Bekräfta: Svarar ej"));

    expect(mutateMock).toHaveBeenCalled();
    const callArgs = mutateMock.mock.calls[0]![0] as { notes: string };
    expect(callArgs.notes).toBe("Test notes");
  });
});
