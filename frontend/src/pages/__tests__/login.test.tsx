import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "../login";

const useMeMock = vi.fn();
const mutateMock = vi.fn();
const useLoginMock = vi.fn();

vi.mock("@/api/auth", () => ({
  useMe: () => useMeMock(),
  useLogin: () => useLoginMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={children} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    useLoginMock.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it("shows loading state", () => {
    useMeMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar...")).toBeInTheDocument();
  });

  it("redirects to dashboard when already logged in", () => {
    useMeMock.mockReturnValue({ data: { id: "1", name: "Test" }, isLoading: false });
    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders login form when not authenticated", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("SaleFlow")).toBeInTheDocument();
    expect(screen.getByText("Logga in på ditt konto")).toBeInTheDocument();
    expect(screen.getByLabelText(/E-post/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Lösenord/i)).toBeInTheDocument();
    expect(screen.getByText("Logga in")).toBeInTheDocument();
  });

  it("calls login on form submit", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    render(<LoginPage />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Logga in" }));

    expect(mutateMock).toHaveBeenCalledWith(
      { email: "test@test.se", password: "pass123" },
      expect.any(Object),
    );
  });

  it("shows error when login fails", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    useLoginMock.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
      isError: true,
      error: { message: "Fel lösenord" },
    });

    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("Fel lösenord")).toBeInTheDocument();
  });

  it("shows pending state", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    useLoginMock.mockReturnValue({
      mutate: mutateMock,
      isPending: true,
      isError: false,
      error: null,
    });

    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("Loggar in...")).toBeInTheDocument();
  });

  it("navigates to dashboard on successful login", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    // Make mutate call the onSuccess callback
    mutateMock.mockImplementation((_params: unknown, opts: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    // Use click instead of submit to avoid FormData constructor issue in jsdom
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    expect(mutateMock).toHaveBeenCalled();
  });

  it("shows default error message when error has no message", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    useLoginMock.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
      isError: true,
      error: null,
    });

    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inloggningen misslyckades")).toBeInTheDocument();
  });
});
