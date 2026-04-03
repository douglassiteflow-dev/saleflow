import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TelavoxConnect } from "@/components/telavox-connect";

const useTelavoxStatusMock = vi.fn();
const connectMutateMock = vi.fn();
const disconnectMutateMock = vi.fn();
const useTelavoxConnectMock = vi.fn();
const useTelavoxDisconnectMock = vi.fn();

vi.mock("@/api/telavox", () => ({
  useTelavoxStatus: () => useTelavoxStatusMock(),
  useTelavoxConnect: () => useTelavoxConnectMock(),
  useTelavoxDisconnect: () => useTelavoxDisconnectMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("TelavoxConnect", () => {
  beforeEach(() => {
    useTelavoxConnectMock.mockReturnValue({
      mutate: connectMutateMock,
      isPending: false,
      isError: false,
      error: null,
    });
    useTelavoxDisconnectMock.mockReturnValue({
      mutate: disconnectMutateMock,
      isPending: false,
    });
    connectMutateMock.mockClear();
    disconnectMutateMock.mockClear();
  });

  it("renders loading state", () => {
    useTelavoxStatusMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar...")).toBeInTheDocument();
  });

  it("renders disconnected state with token input", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText("Telavox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("eyJ0eXAi...")).toBeInTheDocument();
    expect(screen.getByText("Anslut")).toBeInTheDocument();
  });

  it("renders connected state with name and extension", () => {
    useTelavoxStatusMock.mockReturnValue({
      data: { connected: true, name: "Anna Svensson", extension: "1234" },
      isLoading: false,
    });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText("Kopplad")).toBeInTheDocument();
    expect(screen.getByText(/Anna Svensson/)).toBeInTheDocument();
    expect(screen.getByText(/1234/)).toBeInTheDocument();
    expect(screen.getByText("Koppla bort")).toBeInTheDocument();
  });

  it("renders expired state with warning", () => {
    useTelavoxStatusMock.mockReturnValue({
      data: { connected: false, expired: true },
      isLoading: false,
    });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText(/Din Telavox-token har gått ut/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("eyJ0eXAi...")).toBeInTheDocument();
  });

  it("disables Anslut button when token is empty", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    const button = screen.getByText("Anslut");
    expect(button).toBeDisabled();
  });

  it("enables Anslut button when token is entered", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    const input = screen.getByPlaceholderText("eyJ0eXAi...");
    fireEvent.change(input, { target: { value: "some-token" } });
    const button = screen.getByText("Anslut");
    expect(button).not.toBeDisabled();
  });

  it("calls connect mutate with trimmed token", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    const input = screen.getByPlaceholderText("eyJ0eXAi...");
    fireEvent.change(input, { target: { value: "  my-token  " } });
    fireEvent.click(screen.getByText("Anslut"));
    expect(connectMutateMock).toHaveBeenCalledWith("my-token", expect.any(Object));
  });

  it("calls disconnect mutate when Koppla bort is clicked", () => {
    useTelavoxStatusMock.mockReturnValue({
      data: { connected: true, name: "Test", extension: "100" },
      isLoading: false,
    });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Koppla bort"));
    expect(disconnectMutateMock).toHaveBeenCalled();
  });

  it("shows pending state for connect", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    useTelavoxConnectMock.mockReturnValue({
      mutate: connectMutateMock,
      isPending: true,
      isError: false,
      error: null,
    });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText("Ansluter...")).toBeInTheDocument();
  });

  it("shows pending state for disconnect", () => {
    useTelavoxStatusMock.mockReturnValue({
      data: { connected: true, name: "Test", extension: "100" },
      isLoading: false,
    });
    useTelavoxDisconnectMock.mockReturnValue({
      mutate: disconnectMutateMock,
      isPending: true,
    });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText("Kopplar bort...")).toBeInTheDocument();
  });

  it("shows error message when connect fails", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    useTelavoxConnectMock.mockReturnValue({
      mutate: connectMutateMock,
      isPending: false,
      isError: true,
      error: new Error("Ogiltig token"),
    });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText("Ogiltig token")).toBeInTheDocument();
  });

  it("does not call connect when token is only whitespace", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    const input = screen.getByPlaceholderText("eyJ0eXAi...");
    fireEvent.change(input, { target: { value: "   " } });
    // Button should still be disabled
    expect(screen.getByText("Anslut")).toBeDisabled();
  });

  it("renders description text when disconnected", () => {
    useTelavoxStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText(/Klistra in din Telavox JWT-token/)).toBeInTheDocument();
  });

  it("renders without status data (undefined)", () => {
    useTelavoxStatusMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText("Telavox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("eyJ0eXAi...")).toBeInTheDocument();
  });
});
