import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "../layout";

vi.mock("@/api/auth", () => ({
  useMe: vi.fn(() => ({ data: { name: "Test", role: "admin" } })),
  useLogout: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("Layout", () => {
  it("renders sidebar, topbar and outlet", () => {
    render(
      <Wrapper>
        <MemoryRouter initialEntries={["/test"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/test" element={<div>Outlet content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    );

    expect(screen.getByText("Saleflow")).toBeInTheDocument();
    expect(screen.getByText("Logga ut")).toBeInTheDocument();
    expect(screen.getByText("Outlet content")).toBeInTheDocument();
  });
});
