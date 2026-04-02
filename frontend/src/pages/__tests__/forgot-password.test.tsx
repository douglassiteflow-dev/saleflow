import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ForgotPasswordPage } from "../forgot-password";

const forgotPasswordMutateMock = vi.fn();
const useForgotPasswordMock = vi.fn();

vi.mock("@/api/auth", () => ({
  useForgotPassword: () => useForgotPasswordMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Routes>
          <Route path="/forgot-password" element={children} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    useForgotPasswordMock.mockReturnValue({
      mutate: forgotPasswordMutateMock,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    });
  });

  it("renders the form", () => {
    render(<ForgotPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByText("Återställ ditt lösenord")).toBeInTheDocument();
    expect(screen.getByLabelText(/E-post/i)).toBeInTheDocument();
    expect(screen.getByText("Skicka återställningslänk")).toBeInTheDocument();
  });

  it("renders back to login link", () => {
    render(<ForgotPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByText("Tillbaka till inloggning")).toBeInTheDocument();
  });

  it("calls forgotPassword on form submit", () => {
    render(<ForgotPasswordPage />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText(/E-post/i), {
      target: { value: "test@test.se" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Skicka återställningslänk" }));

    expect(forgotPasswordMutateMock).toHaveBeenCalledWith({ email: "test@test.se" });
  });

  it("shows success message after submission", () => {
    useForgotPasswordMock.mockReturnValue({
      mutate: forgotPasswordMutateMock,
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
    });

    render(<ForgotPasswordPage />, { wrapper: Wrapper });
    expect(
      screen.getByText("Om kontot finns har vi skickat en länk till din e-post."),
    ).toBeInTheDocument();
  });

  it("shows pending state", () => {
    useForgotPasswordMock.mockReturnValue({
      mutate: forgotPasswordMutateMock,
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
    });

    render(<ForgotPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByText("Skickar...")).toBeInTheDocument();
  });

  it("shows error message on failure", () => {
    useForgotPasswordMock.mockReturnValue({
      mutate: forgotPasswordMutateMock,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: { message: "Server error" },
    });

    render(<ForgotPasswordPage />, { wrapper: Wrapper });
    expect(screen.getByText("Server error")).toBeInTheDocument();
  });

  it("navigates back to login when link is clicked", () => {
    render(<ForgotPasswordPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Tillbaka till inloggning"));
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });
});
