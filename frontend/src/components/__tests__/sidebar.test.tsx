import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar, NavItem } from "../sidebar";

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Sidebar", () => {
  it("renders logo", () => {
    render(<Sidebar />, { wrapper: Wrapper });
    expect(screen.getByText("Saleflow")).toBeInTheDocument();
  });

  it("renders overview navigation", () => {
    render(<Sidebar />, { wrapper: Wrapper });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Möten")).toBeInTheDocument();
    expect(screen.getByText("Samtalshistorik")).toBeInTheDocument();
  });

  it("renders sales navigation", () => {
    render(<Sidebar />, { wrapper: Wrapper });
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Kunder")).toBeInTheDocument();
  });

  it("renders admin navigation", () => {
    render(<Sidebar />, { wrapper: Wrapper });
    expect(screen.getByText("Användare")).toBeInTheDocument();
    expect(screen.getByText("Importera")).toBeInTheDocument();
    expect(screen.getByText("Listor")).toBeInTheDocument();
    expect(screen.getByText("Statistik")).toBeInTheDocument();
    expect(screen.getByText("Förfrågningar")).toBeInTheDocument();
    expect(screen.getByText("Loggar")).toBeInTheDocument();
    expect(screen.getByText("Appar")).toBeInTheDocument();
  });

  it("renders report button", () => {
    render(<Sidebar />, { wrapper: Wrapper });
    expect(screen.getByText("Rapportera")).toBeInTheDocument();
  });

  it("renders nav links as NavLink elements", () => {
    render(<Sidebar />, { wrapper: Wrapper });
    const dashboardLink = screen.getByText("Dashboard");
    expect(dashboardLink.closest("a")).toHaveAttribute("href", "/dashboard");
  });
});

describe("NavItem", () => {
  it("renders as disabled when disabled prop is true", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <NavItem to="/test" label="Coming Soon" disabled />
        </BrowserRouter>
      </QueryClientProvider>,
    );
    const item = screen.getByText("Coming Soon");
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("title", "Kommer snart");
    expect(item.tagName).toBe("SPAN");
  });

  it("renders as link when not disabled", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <NavItem to="/test" label="Test" />
        </BrowserRouter>
      </QueryClientProvider>,
    );
    const item = screen.getByText("Test");
    expect(item.closest("a")).toHaveAttribute("href", "/test");
  });

  it("renders active style when on matching route", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<NavItem to="/dashboard" label="Dashboard" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const item = screen.getByText("Dashboard");
    expect(item.className).toContain("bg-indigo-50");
  });
});
