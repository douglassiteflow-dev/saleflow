import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminUsersPage } from "../admin-users";

const mutateAsyncMock = vi.fn();
const useAdminUsersMock = vi.fn();
const useCreateUserMock = vi.fn();

vi.mock("@/api/admin", () => ({
  useAdminUsers: () => useAdminUsersMock(),
  useCreateUser: () => useCreateUserMock(),
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
    useCreateUserMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    });
    useAdminUsersMock.mockReturnValue({
      data: [
        { id: "1", email: "admin@test.se", name: "AdminUser", role: "admin", active: true, created_at: "", updated_at: "" },
        { id: "2", email: "agent@test.se", name: "AgentUser", role: "agent", active: false, created_at: "", updated_at: "" },
      ],
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
    // Admin role badge
    expect(screen.getByText("Admin")).toBeInTheDocument();
    // Agent role badge
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("renders active/inactive status", () => {
    render(<AdminUsersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.getByText("Inaktiv")).toBeInTheDocument();
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
    fireEvent.change(screen.getByPlaceholderText("namn@foretag.se"), { target: { value: "test@test.se" } });
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
    fireEvent.change(screen.getByPlaceholderText("namn@foretag.se"), { target: { value: "test@test.se" } });
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
    fireEvent.change(screen.getByPlaceholderText("namn@foretag.se"), { target: { value: "test@test.se" } });
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
    expect(screen.getByText("Laddar användare...")).toBeInTheDocument();
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
    fireEvent.change(screen.getByPlaceholderText("namn@foretag.se"), { target: { value: "admin@test.se" } });
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
    fireEvent.change(screen.getByPlaceholderText("namn@foretag.se"), { target: { value: "test@test.se" } });
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
});
