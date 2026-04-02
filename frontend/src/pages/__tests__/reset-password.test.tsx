import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResetPasswordPage } from "../reset-password";

const resetPasswordMutateMock = vi.fn();
const useResetPasswordMock = vi.fn();

vi.mock("@/api/auth", () => ({
  useResetPassword: () => useResetPasswordMock(),
}));

function createWrapper(initialEntries: string[]) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/reset-password" element={children} />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    useResetPasswordMock.mockReturnValue({
      mutate: resetPasswordMutateMock,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    });
  });

  it("shows error when token is missing", () => {
    const Wrapper = createWrapper(["/reset-password"]);
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Ogiltig återställningslänk/)).toBeInTheDocument();
  });

  it("renders the form when token is present", () => {
    const Wrapper = createWrapper(["/reset-password?token=abc123"]);
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByText("Välj ett nytt lösenord")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nytt lösenord/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bekräfta lösenord/i)).toBeInTheDocument();
    expect(screen.getByText("Återställ lösenord")).toBeInTheDocument();
  });

  it("calls resetPassword on form submit", () => {
    const Wrapper = createWrapper(["/reset-password?token=abc123"]);
    render(<ResetPasswordPage />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText(/Nytt lösenord/i), {
      target: { value: "newpass456" },
    });
    fireEvent.change(screen.getByLabelText(/Bekräfta lösenord/i), {
      target: { value: "newpass456" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Återställ lösenord" }));

    expect(resetPasswordMutateMock).toHaveBeenCalledWith(
      {
        token: "abc123",
        password: "newpass456",
        password_confirmation: "newpass456",
      },
      expect.any(Object),
    );
  });

  it("shows success message after reset", () => {
    useResetPasswordMock.mockReturnValue({
      mutate: resetPasswordMutateMock,
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
    });

    const Wrapper = createWrapper(["/reset-password?token=abc123"]);
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    expect(
      screen.getByText(/Ditt lösenord har återställts/),
    ).toBeInTheDocument();
  });

  it("shows pending state", () => {
    useResetPasswordMock.mockReturnValue({
      mutate: resetPasswordMutateMock,
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
    });

    const Wrapper = createWrapper(["/reset-password?token=abc123"]);
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByText("Återställer...")).toBeInTheDocument();
  });

  it("shows error message on failure", () => {
    useResetPasswordMock.mockReturnValue({
      mutate: resetPasswordMutateMock,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: { message: "Invalid or expired reset token" },
    });

    const Wrapper = createWrapper(["/reset-password?token=abc123"]);
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    expect(
      screen.getByText("Invalid or expired reset token"),
    ).toBeInTheDocument();
  });

  it("navigates back to login when link is clicked", () => {
    const Wrapper = createWrapper(["/reset-password?token=abc123"]);
    render(<ResetPasswordPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Tillbaka till inloggning"));
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });
});
