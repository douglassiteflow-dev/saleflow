import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminAppDetailPage } from "../admin-app-detail";

const useAdminAppDetailMock = vi.fn();
const toggleMutateMock = vi.fn();
const useToggleAppMock = vi.fn();
const addMutateMock = vi.fn();
const useAddPermissionMock = vi.fn();
const removeMutateMock = vi.fn();
const useRemovePermissionMock = vi.fn();

vi.mock("@/api/apps", () => ({
  useAdminAppDetail: (slug: string | undefined) => useAdminAppDetailMock(slug),
  useToggleApp: () => useToggleAppMock(),
  useAddPermission: () => useAddPermissionMock(),
  useRemovePermission: () => useRemovePermissionMock(),
}));

const mockApp = {
  id: "app-1",
  slug: "test-app",
  name: "Test App",
  description: "Kort beskrivning",
  long_description: "En lång beskrivning av appen som visas på detaljsidan.",
  icon: null,
  active: true,
};

const mockAgents = [
  { user_id: "u1", name: "Anna Andersson", has_access: true },
  { user_id: "u2", name: "Björn Berg", has_access: false },
];

function renderPage(slug = "test-app") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/admin/apps/${slug}`]}>
        <Routes>
          <Route path="/admin/apps/:slug" element={<AdminAppDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAppDetailPage", () => {
  beforeEach(() => {
    useAdminAppDetailMock.mockReturnValue({
      data: { app: mockApp, agents: mockAgents },
      isLoading: false,
    });
    useToggleAppMock.mockReturnValue({
      mutate: toggleMutateMock,
      isPending: false,
    });
    useAddPermissionMock.mockReturnValue({
      mutate: addMutateMock,
      isPending: false,
    });
    useRemovePermissionMock.mockReturnValue({
      mutate: removeMutateMock,
      isPending: false,
    });
  });

  it("renders loading state", () => {
    useAdminAppDetailMock.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByText("Laddar app...")).toBeInTheDocument();
  });

  it("renders app name as heading", () => {
    renderPage();
    expect(screen.getByText("Test App")).toBeInTheDocument();
  });

  it("renders long description", () => {
    renderPage();
    expect(
      screen.getByText("En lång beskrivning av appen som visas på detaljsidan."),
    ).toBeInTheDocument();
  });

  it("renders back link", () => {
    renderPage();
    expect(screen.getByText(/Tillbaka till appar/)).toBeInTheDocument();
  });

  it("renders activate button when active", () => {
    renderPage();
    expect(screen.getByText("Aktiverad")).toBeInTheDocument();
  });

  it("renders activate button when inactive", () => {
    useAdminAppDetailMock.mockReturnValue({
      data: { app: { ...mockApp, active: false }, agents: mockAgents },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Aktivera")).toBeInTheDocument();
  });

  it("calls toggleApp on button click", () => {
    renderPage();
    fireEvent.click(screen.getByText("Aktiverad"));
    expect(toggleMutateMock).toHaveBeenCalledWith("test-app");
  });

  it("shows pending state for toggle", () => {
    useToggleAppMock.mockReturnValue({
      mutate: toggleMutateMock,
      isPending: true,
    });
    renderPage();
    expect(screen.getByText("Sparar...")).toBeInTheDocument();
  });

  it("renders agent permissions section", () => {
    renderPage();
    expect(screen.getByText("Agenttillgång")).toBeInTheDocument();
  });

  it("renders all agents with checkboxes", () => {
    renderPage();
    expect(screen.getByText("Anna Andersson")).toBeInTheDocument();
    expect(screen.getByText("Björn Berg")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("calls addPermission when unchecked agent is checked", () => {
    renderPage();
    const checkboxes = screen.getAllByRole("checkbox");
    // Björn Berg is unchecked — clicking should add permission
    fireEvent.click(checkboxes[1]!);
    expect(addMutateMock).toHaveBeenCalledWith({ slug: "test-app", userId: "u2" });
  });

  it("calls removePermission when checked agent is unchecked", () => {
    renderPage();
    const checkboxes = screen.getAllByRole("checkbox");
    // Anna Andersson is checked — clicking should remove permission
    fireEvent.click(checkboxes[0]!);
    expect(removeMutateMock).toHaveBeenCalledWith({ slug: "test-app", userId: "u1" });
  });

  it("renders empty state when no agents", () => {
    useAdminAppDetailMock.mockReturnValue({
      data: { app: mockApp, agents: [] },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Inga agenter hittades.")).toBeInTheDocument();
  });

  it("does not render long description when null", () => {
    useAdminAppDetailMock.mockReturnValue({
      data: { app: { ...mockApp, long_description: null }, agents: mockAgents },
      isLoading: false,
    });
    renderPage();
    expect(screen.queryByText(/lång beskrivning/)).not.toBeInTheDocument();
  });

  it("passes slug from URL to useAdminAppDetail", () => {
    renderPage("my-custom-slug");
    expect(useAdminAppDetailMock).toHaveBeenCalledWith("my-custom-slug");
  });
});
