import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../app";

// Mock all pages and components to isolate the router test
const useMeMock = vi.fn();
vi.mock("@/api/auth", () => ({
  useMe: () => useMeMock(),
  useLogin: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null })),
  useVerifyOtp: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null })),
  useResendOtp: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, error: null })),
  useLogout: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/api/sessions", () => ({
  useMySessions: vi.fn(() => ({ data: [], isLoading: false })),
  useLogoutAll: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useForceLogoutSession: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

describe("App", () => {
  beforeEach(() => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    window.history.pushState({}, "", "/");
  });

  it("renders without crashing", () => {
    render(<App />);
    // Default route redirects to /dashboard, which needs auth -> redirects to /login
    // Login page should render
    expect(screen.getByText("SaleFlow")).toBeInTheDocument();
  });

  it("redirects wildcard routes to /dashboard (then to /login without auth)", () => {
    window.history.pushState({}, "", "/some/unknown/path");
    render(<App />);
    // Wildcard redirects to /dashboard, but user is not authed -> redirects to /login
    expect(screen.getByText("SaleFlow")).toBeInTheDocument();
  });

  it("/login is accessible without authentication", () => {
    window.history.pushState({}, "", "/login");
    render(<App />);
    expect(screen.getByText("SaleFlow")).toBeInTheDocument();
    expect(screen.getByText("Logga in")).toBeInTheDocument();
  });
});
