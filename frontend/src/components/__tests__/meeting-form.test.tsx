import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { MeetingForm } from "../meeting-form";

const mutateAsyncMock = vi.fn();
const useCreateMeetingMock = vi.fn();
vi.mock("@/api/meetings", () => ({
  useCreateMeeting: () => useCreateMeetingMock(),
}));

// Mock TimeSelect so we can set time easily in tests
let timeOnChange: ((value: string) => void) | undefined;
vi.mock("@/components/ui/time-select", () => ({
  TimeSelect: ({ onChange, value, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) => {
    timeOnChange = onChange;
    return (
      <input
        data-testid="time-select"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="HH:MM"
      />
    );
  },
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

function fillFormAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText("lead-uuid"), { target: { value: "lead-1" } });
  fireEvent.change(screen.getByPlaceholderText("Mötesbeskrivning"), { target: { value: "Test meeting" } });
  const dateInput = document.querySelector('input[type="date"]')!;
  fireEvent.change(dateInput, { target: { value: "2024-06-01" } });
  fireEvent.change(screen.getByTestId("time-select"), { target: { value: "14:00" } });
  const form = document.querySelector("form")!;
  fireEvent.submit(form);
}

describe("MeetingForm", () => {
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsyncMock.mockResolvedValue({});
    useCreateMeetingMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    });
  });

  it("renders form fields", () => {
    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    expect(screen.getByText("Nytt möte")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("lead-uuid")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Mötesbeskrivning")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Valfria anteckningar...")).toBeInTheDocument();
  });

  it("shows error when required fields are empty", async () => {
    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Spara möte"));
    await waitFor(() => {
      expect(screen.getByText("Kund-ID, titel, datum och tid är obligatoriska.")).toBeInTheDocument();
    });
  });

  it("submits form when all fields are filled", async () => {
    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    fillFormAndSubmit();

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          lead_id: "lead-1",
          title: "Test meeting",
        }),
      );
    });
  });

  it("calls onCancel after successful submit", async () => {
    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    fillFormAndSubmit();

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
  });

  it("shows error on submit failure", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("Network error"));

    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    fillFormAndSubmit();

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("calls onCancel when Avbryt is clicked", () => {
    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Avbryt"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows fallback error when error has no message", async () => {
    mutateAsyncMock.mockRejectedValue({});

    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    fillFormAndSubmit();

    await waitFor(() => {
      expect(screen.getByText("Något gick fel.")).toBeInTheDocument();
    });
  });

  it("shows pending state on submit button", () => {
    useCreateMeetingMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: true,
    });
    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    expect(screen.getByText("Sparar...")).toBeInTheDocument();
  });

  it("includes notes in submission when provided", async () => {
    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByPlaceholderText("lead-uuid"), { target: { value: "lead-1" } });
    fireEvent.change(screen.getByPlaceholderText("Mötesbeskrivning"), { target: { value: "Meeting" } });
    const dateInput = document.querySelector('input[type="date"]')!;
    fireEvent.change(dateInput, { target: { value: "2024-06-01" } });
    fireEvent.change(screen.getByTestId("time-select"), { target: { value: "14:00" } });
    fireEvent.change(screen.getByPlaceholderText("Valfria anteckningar..."), { target: { value: "My notes" } });
    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ notes: "My notes" }),
      );
    });
  });

  it("renders time select", () => {
    render(<MeetingForm onCancel={onCancel} />, { wrapper: Wrapper });
    expect(screen.getByTestId("time-select")).toBeInTheDocument();
  });
});
