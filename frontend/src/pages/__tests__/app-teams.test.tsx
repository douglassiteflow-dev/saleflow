import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppTeamsPage } from "../app-teams";

const useMicrosoftStatusMock = vi.fn();
const useMicrosoftAuthorizeMock = vi.fn();
const useMicrosoftDisconnectMock = vi.fn();
const authorizeMutateMock = vi.fn();
const disconnectMutateMock = vi.fn();

vi.mock("@/api/microsoft", () => ({
  useMicrosoftStatus: () => useMicrosoftStatusMock(),
  useMicrosoftAuthorize: () => useMicrosoftAuthorizeMock(),
  useMicrosoftDisconnect: () => useMicrosoftDisconnectMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("AppTeamsPage", () => {
  beforeEach(() => {
    useMicrosoftAuthorizeMock.mockReturnValue({ mutate: authorizeMutateMock, isPending: false });
    useMicrosoftDisconnectMock.mockReturnValue({ mutate: disconnectMutateMock, isPending: false });
  });

  it("renders Microsoft Teams heading", () => {
    useMicrosoftStatusMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Microsoft Teams")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    useMicrosoftStatusMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar...")).toBeInTheDocument();
  });

  it("renders connect button when not connected", () => {
    useMicrosoftStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Koppla Microsoft")).toBeInTheDocument();
  });

  it("renders disconnect button when connected", () => {
    useMicrosoftStatusMock.mockReturnValue({ data: { connected: true, email: "test@test.se" }, isLoading: false });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Koppla bort")).toBeInTheDocument();
  });

  it("renders connected email when connected", () => {
    useMicrosoftStatusMock.mockReturnValue({ data: { connected: true, email: "test@company.se" }, isLoading: false });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    expect(screen.getByText("test@company.se")).toBeInTheDocument();
  });

  it("renders Kopplad badge when connected", () => {
    useMicrosoftStatusMock.mockReturnValue({ data: { connected: true, email: null }, isLoading: false });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Kopplad")).toBeInTheDocument();
  });

  it("calls authorize.mutate when Koppla Microsoft is clicked", () => {
    useMicrosoftStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Koppla Microsoft"));
    expect(authorizeMutateMock).toHaveBeenCalled();
  });

  it("calls disconnect.mutate when Koppla bort is clicked", () => {
    useMicrosoftStatusMock.mockReturnValue({ data: { connected: true, email: null }, isLoading: false });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Koppla bort"));
    expect(disconnectMutateMock).toHaveBeenCalled();
  });

  it("shows pending text for authorize", () => {
    useMicrosoftAuthorizeMock.mockReturnValue({ mutate: authorizeMutateMock, isPending: true });
    useMicrosoftStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Ansluter...")).toBeInTheDocument();
  });

  it("shows pending text for disconnect", () => {
    useMicrosoftDisconnectMock.mockReturnValue({ mutate: disconnectMutateMock, isPending: true });
    useMicrosoftStatusMock.mockReturnValue({ data: { connected: true, email: null }, isLoading: false });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Kopplar bort...")).toBeInTheDocument();
  });

  it("renders Teams integration card title", () => {
    useMicrosoftStatusMock.mockReturnValue({ data: { connected: false }, isLoading: false });
    render(<AppTeamsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Teams-integration")).toBeInTheDocument();
  });
});
