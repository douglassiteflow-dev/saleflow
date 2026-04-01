import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProtectedRoute, AdminRoute } from "../protected-route";

const useMeMock = vi.fn();
vi.mock("@/api/auth", () => ({
  useMe: () => useMeMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ProtectedRoute", () => {
  it("shows loading state", () => {
    useMeMock.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <Wrapper>
        <MemoryRouter initialEntries={["/protected"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/protected" element={<div>Protected</div>} />
            </Route>
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    );
    expect(screen.getByText("Laddar...")).toBeInTheDocument();
  });

  it("redirects to login when not authenticated", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    render(
      <Wrapper>
        <MemoryRouter initialEntries={["/protected"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/protected" element={<div>Protected</div>} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    );
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("renders outlet when authenticated", () => {
    useMeMock.mockReturnValue({ data: { id: "1", role: "agent" }, isLoading: false });
    render(
      <Wrapper>
        <MemoryRouter initialEntries={["/protected"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/protected" element={<div>Protected Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    );
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });
});

describe("AdminRoute", () => {
  it("returns null while loading", () => {
    useMeMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(
      <Wrapper>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<div>Admin</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("redirects to login when not authenticated", () => {
    useMeMock.mockReturnValue({ data: null, isLoading: false });
    render(
      <Wrapper>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<div>Admin</div>} />
            </Route>
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    );
    expect(screen.getByText("Login")).toBeInTheDocument();
  });

  it("redirects to dashboard when not admin", () => {
    useMeMock.mockReturnValue({ data: { id: "1", role: "agent" }, isLoading: false });
    render(
      <Wrapper>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<div>Admin</div>} />
            </Route>
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders outlet for admin users", () => {
    useMeMock.mockReturnValue({ data: { id: "1", role: "admin" }, isLoading: false });
    render(
      <Wrapper>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<div>Admin Panel</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    );
    expect(screen.getByText("Admin Panel")).toBeInTheDocument();
  });
});
