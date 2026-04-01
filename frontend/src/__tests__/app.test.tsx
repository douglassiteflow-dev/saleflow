import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../app";

// Mock all pages and components to isolate the router test
vi.mock("@/api/auth", () => ({
  useMe: vi.fn(() => ({ data: null, isLoading: false })),
  useLogin: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null })),
  useLogout: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);
    // Default route redirects to /dashboard, which needs auth → redirects to /login
    // Login page should render
    expect(screen.getByText("SaleFlow")).toBeInTheDocument();
  });
});
