import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Topbar } from "../topbar";

const mutateMock = vi.fn();
const useMeMock = vi.fn();
vi.mock("@/api/auth", () => ({
  useMe: () => useMeMock(),
  useLogout: vi.fn(() => ({
    mutate: mutateMock,
    isPending: false,
  })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Topbar", () => {
  it("renders user name when logged in", () => {
    useMeMock.mockReturnValue({ data: { name: "Anna" } });
    render(<Topbar />, { wrapper: Wrapper });
    expect(screen.getByText("Anna")).toBeInTheDocument();
  });

  it("does not render user name when not logged in", () => {
    useMeMock.mockReturnValue({ data: null });
    render(<Topbar />, { wrapper: Wrapper });
    expect(screen.queryByText("Anna")).not.toBeInTheDocument();
  });

  it("renders logout button", () => {
    useMeMock.mockReturnValue({ data: { name: "Anna" } });
    render(<Topbar />, { wrapper: Wrapper });
    expect(screen.getByText("Logga ut")).toBeInTheDocument();
  });

  it("calls logout on click", () => {
    useMeMock.mockReturnValue({ data: { name: "Anna" } });
    render(<Topbar />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Logga ut"));
    expect(mutateMock).toHaveBeenCalled();
  });
});
