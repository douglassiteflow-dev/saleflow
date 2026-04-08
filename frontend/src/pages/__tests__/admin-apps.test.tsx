import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminAppsPage } from "../admin-apps";

const useAdminAppsMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/api/apps", () => ({
  useAdminApps: () => useAdminAppsMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const mockApps = [
  { id: "1", slug: "genflow", name: "Genflow", description: "Generera hemsidor", icon: null, active: true, agent_count: 3 },
  { id: "2", slug: "signflow", name: "Signflow", description: null, icon: "signflow.png", active: false, agent_count: 0 },
];

describe("AdminAppsPage", () => {
  beforeEach(() => {
    useAdminAppsMock.mockReturnValue({ data: mockApps, isLoading: false });
  });

  it("renders page heading", () => {
    render(<AdminAppsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Appar")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    useAdminAppsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AdminAppsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar appar...")).toBeInTheDocument();
  });

  it("renders empty state when no apps", () => {
    useAdminAppsMock.mockReturnValue({ data: [], isLoading: false });
    render(<AdminAppsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga appar hittades.")).toBeInTheDocument();
  });

  it("renders null apps as empty state", () => {
    useAdminAppsMock.mockReturnValue({ data: null, isLoading: false });
    render(<AdminAppsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga appar hittades.")).toBeInTheDocument();
  });

  it("renders app names", () => {
    render(<AdminAppsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Genflow")).toBeInTheDocument();
    expect(screen.getByText("Signflow")).toBeInTheDocument();
  });

  it("renders active/inactive badges", () => {
    render(<AdminAppsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Aktiverad")).toBeInTheDocument();
    expect(screen.getByText("Ej aktiverad")).toBeInTheDocument();
  });

  it("renders agent count", () => {
    render(<AdminAppsPage />, { wrapper: Wrapper });
    expect(screen.getByText("3 agenter")).toBeInTheDocument();
    expect(screen.getByText("0 agenter")).toBeInTheDocument();
  });

  it("renders description or fallback", () => {
    render(<AdminAppsPage />, { wrapper: Wrapper });
    expect(screen.getByText("Generera hemsidor")).toBeInTheDocument();
    expect(screen.getByText("Ingen beskrivning")).toBeInTheDocument();
  });

  it("navigates to app detail on click", () => {
    render(<AdminAppsPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Genflow"));
    expect(navigateMock).toHaveBeenCalledWith("/admin/apps/genflow");
  });

  it("renders icon image when icon is a png", () => {
    render(<AdminAppsPage />, { wrapper: Wrapper });
    const img = screen.getByAltText("Signflow");
    expect(img).toBeInTheDocument();
  });

  it("renders initial letter avatar when no icon", () => {
    render(<AdminAppsPage />, { wrapper: Wrapper });
    expect(screen.getByText("G")).toBeInTheDocument();
  });
});
