import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "../login";

const useMeMock = vi.fn();
const loginMutateMock = vi.fn();
const useLoginMock = vi.fn();
const verifyOtpMutateMock = vi.fn();
const useVerifyOtpMock = vi.fn();
const resendOtpMutateMock = vi.fn();
const useResendOtpMock = vi.fn();
const isLoginTrustedResponseMock = vi.fn();

vi.mock("@/api/auth", () => ({
  useMe: () => useMeMock(),
  useLogin: () => useLoginMock(),
  useVerifyOtp: () => useVerifyOtpMock(),
  useResendOtp: () => useResendOtpMock(),
  isLoginTrustedResponse: (resp: unknown) => isLoginTrustedResponseMock(resp),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={children} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/forgot-password" element={<div>Forgot Password</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    isLoginTrustedResponseMock.mockReturnValue(false);
    useLoginMock.mockReturnValue({
      mutate: loginMutateMock,
      isPending: false,
      isError: false,
      error: null,
    });
    useVerifyOtpMock.mockReturnValue({
      mutate: verifyOtpMutateMock,
      isPending: false,
      isError: false,
      error: null,
    });
    useResendOtpMock.mockReturnValue({
      mutate: resendOtpMutateMock,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    });
  });

  // --- Credentials step ---

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

  it("renders 'Kom ihåg mig' checkbox", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("Kom ihåg mig")).toBeInTheDocument();
  });

  it("renders 'Glömt lösenord?' link", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("Glömt lösenord?")).toBeInTheDocument();
  });

  it("navigates to forgot-password page when link is clicked", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Glömt lösenord?"));
    expect(screen.getByText("Forgot Password")).toBeInTheDocument();
  });

  it("calls login on form submit", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    render(<LoginPage />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Logga in" }));

    expect(loginMutateMock).toHaveBeenCalledWith(
      { email: "test@test.se", password: "pass123" },
      expect.any(Object),
    );
  });

  it("shows error when login fails", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    useLoginMock.mockReturnValue({
      mutate: loginMutateMock,
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
      mutate: loginMutateMock,
      isPending: true,
      isError: false,
      error: null,
    });

    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("Loggar in...")).toBeInTheDocument();
  });

  it("shows default error message when error has no message", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    useLoginMock.mockReturnValue({
      mutate: loginMutateMock,
      isPending: false,
      isError: true,
      error: null,
    });

    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inloggningen misslyckades")).toBeInTheDocument();
  });

  // --- Trusted device (skip OTP) ---

  it("navigates directly to dashboard when trusted device response", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    isLoginTrustedResponseMock.mockReturnValue(true);
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { user: { id: string; name: string } }) => void }) => {
        opts?.onSuccess?.({ user: { id: "u-trusted", name: "Trusted" } });
      },
    );

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    // Should navigate directly to dashboard (no OTP step)
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  // --- OTP step ---

  it("transitions to OTP step on successful login", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-123" });
      },
    );

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    // Should now show OTP step
    expect(screen.getByText("Kod skickad till din e-post")).toBeInTheDocument();
    expect(screen.getByLabelText("Siffra 1")).toBeInTheDocument();
  });

  it("shows resend link on OTP step", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-123" });
      },
    );

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    expect(screen.getByText("Skicka ny kod")).toBeInTheDocument();
  });

  it("calls resendOtp when resend link is clicked", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-123" });
      },
    );

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    fireEvent.click(screen.getByText("Skicka ny kod"));
    expect(resendOtpMutateMock).toHaveBeenCalledWith({ email: "test@test.se", password: "pass123" });
  });

  it("shows OTP verification error", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-123" });
      },
    );
    useVerifyOtpMock.mockReturnValue({
      mutate: verifyOtpMutateMock,
      isPending: false,
      isError: true,
      error: { message: "Fel kod" },
    });

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    expect(screen.getByText("Fel kod")).toBeInTheDocument();
  });

  it("shows verifying state", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-123" });
      },
    );
    useVerifyOtpMock.mockReturnValue({
      mutate: verifyOtpMutateMock,
      isPending: true,
      isError: false,
      error: null,
    });

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    expect(screen.getByText("Verifierar...")).toBeInTheDocument();
  });

  it("shows default OTP error when error has no message", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-123" });
      },
    );
    useVerifyOtpMock.mockReturnValue({
      mutate: verifyOtpMutateMock,
      isPending: false,
      isError: true,
      error: null,
    });

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    expect(screen.getByText("Verifieringen misslyckades")).toBeInTheDocument();
  });

  it("calls verifyOtp with user_id, code, and remember_me on OTP complete", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-456" });
      },
    );

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    // Now on OTP step, fill in all 6 digits
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0]!, { target: { value: "1" } });
    fireEvent.change(inputs[1]!, { target: { value: "2" } });
    fireEvent.change(inputs[2]!, { target: { value: "3" } });
    fireEvent.change(inputs[3]!, { target: { value: "4" } });
    fireEvent.change(inputs[4]!, { target: { value: "5" } });
    fireEvent.change(inputs[5]!, { target: { value: "6" } });

    expect(verifyOtpMutateMock).toHaveBeenCalledWith(
      { user_id: "u-456", code: "123456", remember_me: false },
      expect.any(Object),
    );
  });

  it("passes remember_me: true when checkbox is checked", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-456" });
      },
    );

    render(<LoginPage />, { wrapper: Wrapper });

    // Check the "Kom ihåg mig" checkbox before submitting
    fireEvent.click(screen.getByText("Kom ihåg mig"));

    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    // Fill in OTP
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0]!, { target: { value: "1" } });
    fireEvent.change(inputs[1]!, { target: { value: "2" } });
    fireEvent.change(inputs[2]!, { target: { value: "3" } });
    fireEvent.change(inputs[3]!, { target: { value: "4" } });
    fireEvent.change(inputs[4]!, { target: { value: "5" } });
    fireEvent.change(inputs[5]!, { target: { value: "6" } });

    expect(verifyOtpMutateMock).toHaveBeenCalledWith(
      { user_id: "u-456", code: "123456", remember_me: true },
      expect.any(Object),
    );
  });

  it("navigates to dashboard on successful OTP verification", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-789" });
      },
    );
    // Make verifyOtp immediately call onSuccess
    verifyOtpMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
    );

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    // Fill in OTP
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0]!, { target: { value: "1" } });
    fireEvent.change(inputs[1]!, { target: { value: "2" } });
    fireEvent.change(inputs[2]!, { target: { value: "3" } });
    fireEvent.change(inputs[3]!, { target: { value: "4" } });
    fireEvent.change(inputs[4]!, { target: { value: "5" } });
    fireEvent.change(inputs[5]!, { target: { value: "6" } });

    // Should navigate to dashboard
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("shows resend success message", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    loginMutateMock.mockImplementation(
      (_params: unknown, opts: { onSuccess?: (data: { otp_sent: boolean; user_id: string }) => void }) => {
        opts?.onSuccess?.({ otp_sent: true, user_id: "u-123" });
      },
    );
    useResendOtpMock.mockReturnValue({
      mutate: resendOtpMutateMock,
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
    });

    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText(/E-post/i), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByLabelText(/Lösenord/i), { target: { value: "pass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Logga in" }));

    expect(screen.getByText("Ny kod skickad")).toBeInTheDocument();
  });
});
