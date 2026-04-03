import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminUsersPage } from "../admin-users";

const mutateAsyncMock = vi.fn();
const useAdminUsersMock = vi.fn();
const useCreateUserMock = vi.fn();
const useUserSessionsMock = vi.fn();
const forceLogoutUserMutateMock = vi.fn();
const forceLogoutSessionMutateMock = vi.fn();

vi.mock("@/api/admin", () => ({
  useAdminUsers: () => useAdminUsersMock(),
  useCreateUser: () => useCreateUserMock(),
  useUpdateUser: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

const useForceLogoutUserMock = vi.fn();

vi.mock("@/api/sessions", () => ({
  useUserSessions: () => useUserSessionsMock(),
  useForceLogoutUser: () => useForceLogoutUserMock(),
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

describe("AdminUsersPage", () => {
  beforeEach(() => {
    useForceLogoutUserMock.mockReturnValue({
      mutate: forceLogoutUserMutateMock,
      isPending: false,
    });
    useCreateUserMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    });
    useAdminUsersMock.mockReturnValue({
      data: [
        { id: "1", email: "admin@test.se", name: "AdminUser", role: "admin", phone_number: null, extension_number: null, created_at: "", updated_at: "" },
        { id: "2", email: "agent@test.se", name: "AgentUser", role: "agent", phone_number: null, extension_number: null, created_at: "", updated_at: "" },
      ],
      isLoading: false,
    });
    useUserSessionsMock.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it("renders page title", () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Användare")).toBeInTheDocument();
  });

  it("renders users table", () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Alla användare")).toBeInTheDocument();
    expect(screen.getByText("AdminUser")).toBeInTheDocument();
    expect(screen.getByText("AgentUser")).toBeInTheDocument();
  });

  it("renders role badges", () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("renders sessions button per user", () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    const sessionButtons = screen.getAllByText("Sessioner");
    expect(sessionButtons.length).toBe(2);
  });

  it("toggles user form on button click", () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ny användare"));
    expect(screen.getByText("Stäng formulär")).toBeInTheDocument();
  });

  it("shows validation error when fields are empty", async () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ny användare"));
    fireEvent.click(screen.getByText("Skapa användare"));
    await waitFor(() => {
      expect(screen.getByText("E-post, namn och lösenord är obligatoriska.")).toBeInTheDocument();
    });
  });

  it("shows password mismatch error", async () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ny användare"));

    fireEvent.change(screen.getByPlaceholderText("Förnamn Efternamn"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByPlaceholderText("namn@företag.se"), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByPlaceholderText("Minst 8 tecken"), { target: { value: "password1" } });
    fireEvent.change(screen.getByPlaceholderText("Upprepa lösenord"), { target: { value: "password2" } });

    fireEvent.click(screen.getByText("Skapa användare"));
    await waitFor(() => {
      expect(screen.getByText("Lösenorden stämmer inte överens.")).toBeInTheDocument();
    });
  });

  it("submits form successfully", async () => {
    mutateAsyncMock.mockResolvedValue({});
    render(<AdminUsersPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ny användare"));

    fireEvent.change(screen.getByPlaceholderText("Förnamn Efternamn"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByPlaceholderText("namn@företag.se"), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByPlaceholderText("Minst 8 tecken"), { target: { value: "password" } });
    fireEvent.change(screen.getByPlaceholderText("Upprepa lösenord"), { target: { value: "password" } });

    fireEvent.click(screen.getByText("Skapa användare"));
    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@test.se",
          name: "Test User",
          password: "password",
          role: "agent",
        }),
      );
    });
  });

  it("shows error on submit failure", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("Email taken"));
    render(<AdminUsersPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ny användare"));

    fireEvent.change(screen.getByPlaceholderText("Förnamn Efternamn"), { target: { value: "Test" } });
    fireEvent.change(screen.getByPlaceholderText("namn@företag.se"), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByPlaceholderText("Minst 8 tecken"), { target: { value: "password" } });
    fireEvent.change(screen.getByPlaceholderText("Upprepa lösenord"), { target: { value: "password" } });

    fireEvent.click(screen.getByText("Skapa användare"));
    await waitFor(() => {
      expect(screen.getByText("Email taken")).toBeInTheDocument();
    });
  });

  it("hides form when cancel is clicked", () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ny användare"));
    expect(screen.getByText("Avbryt")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Avbryt"));
    expect(screen.queryByPlaceholderText("Förnamn Efternamn")).not.toBeInTheDocument();
  });

  it("renders loading state", () => {
    useAdminUsersMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AdminUsersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar...")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    useAdminUsersMock.mockReturnValue({ data: [], isLoading: false });
    render(<AdminUsersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga användare hittades.")).toBeInTheDocument();
  });

  it("renders null users as empty state", () => {
    useAdminUsersMock.mockReturnValue({ data: null, isLoading: false });
    render(<AdminUsersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga användare hittades.")).toBeInTheDocument();
  });

  it("can change role to admin", async () => {
    mutateAsyncMock.mockResolvedValue({});
    render(<AdminUsersPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ny användare"));

    fireEvent.change(screen.getByPlaceholderText("Förnamn Efternamn"), { target: { value: "Admin" } });
    fireEvent.change(screen.getByPlaceholderText("namn@företag.se"), { target: { value: "admin@test.se" } });
    fireEvent.change(screen.getByPlaceholderText("Minst 8 tecken"), { target: { value: "password" } });
    fireEvent.change(screen.getByPlaceholderText("Upprepa lösenord"), { target: { value: "password" } });

    // Change role to admin
    const roleSelect = screen.getByDisplayValue("Agent");
    fireEvent.change(roleSelect, { target: { value: "admin" } });

    fireEvent.click(screen.getByText("Skapa användare"));
    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ role: "admin" }),
      );
    });
  });

  it("shows pending state on create user button", () => {
    useCreateUserMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: true,
    });
    render(<AdminUsersPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ny användare"));
    expect(screen.getByText("Sparar...")).toBeInTheDocument();
  });

  it("shows fallback error when error has no message", async () => {
    mutateAsyncMock.mockRejectedValue({});
    render(<AdminUsersPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Ny användare"));

    fireEvent.change(screen.getByPlaceholderText("Förnamn Efternamn"), { target: { value: "Test" } });
    fireEvent.change(screen.getByPlaceholderText("namn@företag.se"), { target: { value: "test@test.se" } });
    fireEvent.change(screen.getByPlaceholderText("Minst 8 tecken"), { target: { value: "password" } });
    fireEvent.change(screen.getByPlaceholderText("Upprepa lösenord"), { target: { value: "password" } });

    fireEvent.click(screen.getByText("Skapa användare"));
    await waitFor(() => {
      expect(screen.getByText("Något gick fel.")).toBeInTheDocument();
    });
  });

  it("renders email column", () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    expect(screen.getByText("admin@test.se")).toBeInTheDocument();
    expect(screen.getByText("agent@test.se")).toBeInTheDocument();
  });

  // --- Expandable sessions ---

  it("expands sessions panel when Sessioner button is clicked", () => {
    useUserSessionsMock.mockReturnValue({
      data: [
        {
          id: "s1",
          device_type: "desktop",
          browser: "Chrome",
          city: "Stockholm",
          country: "Sverige",
          logged_in_at: "2026-03-31T10:00:00Z",
          last_active_at: "2026-03-31T10:00:00Z",
          force_logged_out: false,
          current: false,
        },
      ],
      isLoading: false,
    });

    render(<AdminUsersPage />, { wrapper: Wrapper });
    const sessionButtons = screen.getAllByText("Sessioner");
    fireEvent.click(sessionButtons[0]!);

    expect(screen.getByText("Dölj sessioner")).toBeInTheDocument();
    expect(screen.getByText("Logga ut alla")).toBeInTheDocument();
    expect(screen.getByText("Chrome")).toBeInTheDocument();
  });

  it("collapses sessions panel when toggle is clicked again", () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    const sessionButtons = screen.getAllByText("Sessioner");
    fireEvent.click(sessionButtons[0]!);
    expect(screen.getByText("Dölj sessioner")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Dölj sessioner"));
    expect(screen.queryByText("Logga ut alla")).not.toBeInTheDocument();
  });

  it("shows loading state for sessions", () => {
    useUserSessionsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<AdminUsersPage />, { wrapper: Wrapper });
    const sessionButtons = screen.getAllByText("Sessioner");
    fireEvent.click(sessionButtons[0]!);

    expect(screen.getByText("Laddar...", { exact: false })).toBeInTheDocument();
  });

  it("calls forceLogoutSession when individual session logout is clicked", () => {
    useUserSessionsMock.mockReturnValue({
      data: [
        {
          id: "sess-1",
          device_type: "desktop",
          browser: "Chrome",
          city: "Stockholm",
          country: "Sverige",
          logged_in_at: "2026-03-31T10:00:00Z",
          last_active_at: "2026-03-31T10:00:00Z",
          force_logged_out: false,
          current: false,
        },
      ],
      isLoading: false,
    });

    render(<AdminUsersPage />, { wrapper: Wrapper });
    const sessionButtons = screen.getAllByText("Sessioner");
    fireEvent.click(sessionButtons[0]!);

    // Click the force-logout button on the session (from SessionList's showForceLogout)
    const logoutBtn = screen.getByRole("button", { name: "Logga ut" });
    fireEvent.click(logoutBtn);
    expect(forceLogoutSessionMutateMock).toHaveBeenCalledWith("sess-1");
  });

  it("calls forceLogoutUser when 'Logga ut alla' is clicked", () => {
    useUserSessionsMock.mockReturnValue({
      data: [
        {
          id: "sess-1",
          device_type: "desktop",
          browser: "Chrome",
          city: null,
          country: null,
          logged_in_at: "2026-03-31T10:00:00Z",
          last_active_at: "2026-03-31T10:00:00Z",
          force_logged_out: false,
          current: false,
        },
      ],
      isLoading: false,
    });

    render(<AdminUsersPage />, { wrapper: Wrapper });
    const sessionButtons = screen.getAllByText("Sessioner");
    fireEvent.click(sessionButtons[0]!);

    fireEvent.click(screen.getByText("Logga ut alla"));
    expect(forceLogoutUserMutateMock).toHaveBeenCalledWith("1");
  });

  it("shows 'Loggar ut...' text when forceLogoutUser is pending", () => {
    useForceLogoutUserMock.mockReturnValue({
      mutate: forceLogoutUserMutateMock,
      isPending: true,
    });
    useUserSessionsMock.mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<AdminUsersPage />, { wrapper: Wrapper });
    const sessionButtons = screen.getAllByText("Sessioner");
    fireEvent.click(sessionButtons[0]!);

    expect(screen.getByText("Loggar ut...")).toBeInTheDocument();
  });

  it("renders sessions panel with null sessions data (fallback to empty)", () => {
    useUserSessionsMock.mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(<AdminUsersPage />, { wrapper: Wrapper });
    const sessionButtons = screen.getAllByText("Sessioner");
    fireEvent.click(sessionButtons[0]!);

    // Should render without crash - empty SessionList
    expect(screen.getByText("Logga ut alla")).toBeInTheDocument();
  });
});
