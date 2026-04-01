import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfilePage } from "../profile";

const useMeMock = vi.fn();
const useMySessionsMock = vi.fn();
const logoutAllMutateMock = vi.fn();
const forceLogoutSessionMutateMock = vi.fn();
const useLogoutAllMock = vi.fn();

vi.mock("@/api/auth", () => ({
  useMe: () => useMeMock(),
}));

vi.mock("@/api/sessions", () => ({
  useMySessions: () => useMySessionsMock(),
  useLogoutAll: () => useLogoutAllMock(),
  useForceLogoutSession: () => ({
    mutate: forceLogoutSessionMutateMock,
    isPending: false,
  }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    useLogoutAllMock.mockReturnValue({
      mutate: logoutAllMutateMock,
      isPending: false,
    });
    useMeMock.mockReturnValue({
      data: { id: "1", email: "test@test.se", name: "Test User", role: "agent" },
    });
    useMySessionsMock.mockReturnValue({
      data: [
        {
          id: "s1",
          device_type: "desktop",
          browser: "Chrome",
          city: "Stockholm",
          country: "Sverige",
          logged_in_at: "2026-03-31T10:00:00Z",
          last_active_at: new Date().toISOString(),
          force_logged_out: false,
          current: true,
        },
        {
          id: "s2",
          device_type: "smartphone",
          browser: "Safari",
          city: null,
          country: null,
          logged_in_at: "2026-03-30T14:00:00Z",
          last_active_at: "2026-03-30T14:00:00Z",
          force_logged_out: false,
          current: false,
        },
      ],
      isLoading: false,
    });
  });

  it("renders page title", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Profil")).toBeInTheDocument();
  });

  it("renders user name and email", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@test.se")).toBeInTheDocument();
  });

  it("renders role badge", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("renders admin role badge for admin users", () => {
    useMeMock.mockReturnValue({
      data: { id: "1", email: "admin@test.se", name: "AdminUser", role: "admin" },
    });
    render(<ProfilePage />, { wrapper: Wrapper });
    // Badge text "Admin" inside the badge span
    const badge = screen.getByText("Admin");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-indigo-50");
  });

  it("renders sessions section title", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Mina sessioner")).toBeInTheDocument();
  });

  it("renders session list", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Chrome")).toBeInTheDocument();
    expect(screen.getByText("Safari")).toBeInTheDocument();
  });

  it("renders 'Logga ut överallt' button", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Logga ut överallt")).toBeInTheDocument();
  });

  it("calls logoutAll when button clicked", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Logga ut överallt"));
    expect(logoutAllMutateMock).toHaveBeenCalled();
  });

  it("renders loading state for sessions", () => {
    useMySessionsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar sessioner...")).toBeInTheDocument();
  });

  it("renders 'Nuvarande' badge for current session", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Nuvarande")).toBeInTheDocument();
  });

  it("calls forceLogoutSession when logout is clicked on a session", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    // The non-current session (Safari) should have a logout button
    const logoutButton = screen.getByRole("button", { name: "Logga ut" });
    fireEvent.click(logoutButton);
    expect(forceLogoutSessionMutateMock).toHaveBeenCalledWith("s2");
  });

  it("shows 'Loggar ut...' when logoutAll is pending", () => {
    useLogoutAllMock.mockReturnValue({
      mutate: logoutAllMutateMock,
      isPending: true,
    });

    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Loggar ut...")).toBeInTheDocument();
  });

  it("renders with null sessions (fallback to empty array)", () => {
    useMySessionsMock.mockReturnValue({
      data: null,
      isLoading: false,
    });
    render(<ProfilePage />, { wrapper: Wrapper });
    // SessionList should render without error (empty list)
    expect(screen.getByText("Mina sessioner")).toBeInTheDocument();
  });

  it("renders with undefined sessions (fallback to empty array)", () => {
    useMySessionsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    render(<ProfilePage />, { wrapper: Wrapper });
    // SessionList should render without error (empty list)
    expect(screen.getByText("Mina sessioner")).toBeInTheDocument();
  });
});
