import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialButton } from "@/components/dial-button";

const useTelavoxStatusMock = vi.fn();
const dialMutateMock = vi.fn();
const hangupMutateMock = vi.fn();
const useDialMock = vi.fn();
const useHangupMock = vi.fn();

vi.mock("@/api/telavox", () => ({
  useTelavoxStatus: () => useTelavoxStatusMock(),
  useDial: () => useDialMock(),
  useHangup: () => useHangupMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("DialButton", () => {
  beforeEach(() => {
    dialMutateMock.mockClear();
    hangupMutateMock.mockClear();
    useDialMock.mockReturnValue({ mutate: dialMutateMock, isPending: false });
    useHangupMock.mockReturnValue({ mutate: hangupMutateMock, isPending: false });
  });

  it("renders Ring button when connected and phone present", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: true } });
    render(<DialButton leadId="l1" phone="+46701234567" />, { wrapper: Wrapper });
    expect(screen.getByText("Ring")).toBeInTheDocument();
  });

  it("renders nothing when not connected", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: false } });
    const { container } = render(<DialButton leadId="l1" phone="+46701234567" />, { wrapper: Wrapper });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when phone is empty", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: true } });
    const { container } = render(<DialButton leadId="l1" phone="" />, { wrapper: Wrapper });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when status is undefined", () => {
    useTelavoxStatusMock.mockReturnValue({ data: undefined });
    const { container } = render(<DialButton leadId="l1" phone="+46701234567" />, { wrapper: Wrapper });
    expect(container.innerHTML).toBe("");
  });

  it("calls dial mutate when Ring is clicked", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: true } });
    render(<DialButton leadId="l1" phone="+46701234567" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ring"));
    expect(dialMutateMock).toHaveBeenCalledWith("l1", expect.any(Object));
  });

  it("shows Ringer... when dial is pending", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: true } });
    useDialMock.mockReturnValue({ mutate: dialMutateMock, isPending: true });
    render(<DialButton leadId="l1" phone="+46701234567" />, { wrapper: Wrapper });
    expect(screen.getByText("Ringer...")).toBeInTheDocument();
  });

  it("shows Lägg på button after successful dial", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: true } });
    dialMutateMock.mockImplementation((_id: string, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    render(<DialButton leadId="l1" phone="+46701234567" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ring"));
    expect(screen.getByText("Lägg på")).toBeInTheDocument();
  });

  it("calls hangup mutate when Lägg på is clicked", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: true } });
    dialMutateMock.mockImplementation((_id: string, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    render(<DialButton leadId="l1" phone="+46701234567" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ring"));
    fireEvent.click(screen.getByText("Lägg på"));
    expect(hangupMutateMock).toHaveBeenCalledWith(undefined, expect.any(Object));
  });

  it("returns to Ring button after successful hangup", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: true } });
    dialMutateMock.mockImplementation((_id: string, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    hangupMutateMock.mockImplementation((_: Record<string, unknown>, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    render(<DialButton leadId="l1" phone="+46701234567" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ring"));
    fireEvent.click(screen.getByText("Lägg på"));
    expect(screen.getByText("Ring")).toBeInTheDocument();
  });

  it("shows ... when hangup is pending", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: true } });
    dialMutateMock.mockImplementation((_id: string, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    useHangupMock.mockReturnValue({ mutate: hangupMutateMock, isPending: true });
    render(<DialButton leadId="l1" phone="+46701234567" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ring"));
    expect(screen.getByText("...")).toBeInTheDocument();
  });
});
