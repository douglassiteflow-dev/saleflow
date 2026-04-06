import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPlaybookPage } from "../admin-playbook";

const usePlaybooksMock = vi.fn();
const createMutateAsyncMock = vi.fn();
const useCreatePlaybookMock = vi.fn();
const updateMutateAsyncMock = vi.fn();
const useUpdatePlaybookMock = vi.fn();
const deleteMutateAsyncMock = vi.fn();
const useDeletePlaybookMock = vi.fn();

vi.mock("@/api/playbooks", () => ({
  usePlaybooks: () => usePlaybooksMock(),
  useCreatePlaybook: () => useCreatePlaybookMock(),
  useUpdatePlaybook: () => useUpdatePlaybookMock(),
  useDeletePlaybook: () => useDeletePlaybookMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("AdminPlaybookPage", () => {
  beforeEach(() => {
    createMutateAsyncMock.mockResolvedValue({ ok: true, id: "new-id" });
    updateMutateAsyncMock.mockResolvedValue({ ok: true });
    deleteMutateAsyncMock.mockResolvedValue({ ok: true });

    usePlaybooksMock.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    useCreatePlaybookMock.mockReturnValue({
      mutateAsync: createMutateAsyncMock,
      isPending: false,
    });
    useUpdatePlaybookMock.mockReturnValue({
      mutateAsync: updateMutateAsyncMock,
      isPending: false,
    });
    useDeletePlaybookMock.mockReturnValue({
      mutateAsync: deleteMutateAsyncMock,
      isPending: false,
    });
  });

  it("renders page title", () => {
    render(<AdminPlaybookPage />, { wrapper: Wrapper });
    expect(screen.getByText("Säljmanus & Playbook")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    usePlaybooksMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar manus")).toBeInTheDocument();
  });

  it("shows empty state with create button when no playbooks", () => {
    usePlaybooksMock.mockReturnValue({ data: [], isLoading: false });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga säljmanus skapade ännu.")).toBeInTheDocument();
    expect(screen.getByText("Skapa ditt första manus")).toBeInTheDocument();
  });

  it("shows playbook list when playbooks exist", () => {
    usePlaybooksMock.mockReturnValue({
      data: [
        { id: "1", name: "Standard B2B", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: true },
        { id: "2", name: "Cold call", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false },
      ],
      isLoading: false,
    });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });
    expect(screen.getByText("Standard B2B")).toBeInTheDocument();
    expect(screen.getByText("Cold call")).toBeInTheDocument();
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
  });

  it("shows editor when playbook is selected", () => {
    usePlaybooksMock.mockReturnValue({
      data: [
        { id: "1", name: "Standard B2B", opening: "Hej", pitch: "Vi erbjuder", objections: "Nej", closing: "Boka", guidelines: "Var snäll", active: true },
      ],
      isLoading: false,
    });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Standard B2B"));

    expect(screen.getByText("Redigera manus")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Standard B2B")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hej")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Vi erbjuder")).toBeInTheDocument();
    expect(screen.getByText("Spara")).toBeInTheDocument();
  });

  it("shows placeholder when no playbook selected", () => {
    usePlaybooksMock.mockReturnValue({
      data: [
        { id: "1", name: "PB1", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false },
      ],
      isLoading: false,
    });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });
    expect(screen.getByText("Välj ett manus till vänster för att redigera.")).toBeInTheDocument();
  });

  it("creates a new playbook on button click", async () => {
    usePlaybooksMock.mockReturnValue({ data: [], isLoading: false });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Skapa ditt första manus"));

    await waitFor(() => {
      expect(createMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Nytt manus" }),
      );
    });
  });

  it("saves playbook via editor", async () => {
    usePlaybooksMock.mockReturnValue({
      data: [
        { id: "1", name: "Test", opening: "a", pitch: "b", objections: "c", closing: "d", guidelines: "e", active: false },
      ],
      isLoading: false,
    });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Test"));
    fireEvent.click(screen.getByText("Spara"));

    await waitFor(() => {
      expect(updateMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "1", name: "Test" }),
      );
    });
  });

  it("shows delete confirmation", () => {
    usePlaybooksMock.mockReturnValue({
      data: [
        { id: "1", name: "Del PB", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false },
      ],
      isLoading: false,
    });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Del PB"));
    fireEvent.click(screen.getByText("Radera"));

    expect(screen.getByText("Bekräfta radering?")).toBeInTheDocument();
    expect(screen.getByText("Ja, radera")).toBeInTheDocument();
    expect(screen.getByText("Avbryt")).toBeInTheDocument();
  });

  it("deletes playbook after confirmation", async () => {
    usePlaybooksMock.mockReturnValue({
      data: [
        { id: "1", name: "Del PB", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false },
      ],
      isLoading: false,
    });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Del PB"));
    fireEvent.click(screen.getByText("Radera"));
    fireEvent.click(screen.getByText("Ja, radera"));

    await waitFor(() => {
      expect(deleteMutateAsyncMock).toHaveBeenCalledWith("1");
    });
  });

  it("cancels delete when Avbryt is clicked", () => {
    usePlaybooksMock.mockReturnValue({
      data: [
        { id: "1", name: "Keep PB", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false },
      ],
      isLoading: false,
    });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Keep PB"));
    fireEvent.click(screen.getByText("Radera"));
    expect(screen.getByText("Bekräfta radering?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Avbryt"));
    expect(screen.queryByText("Bekräfta radering?")).not.toBeInTheDocument();
  });

  it("active toggle is displayed in editor", () => {
    usePlaybooksMock.mockReturnValue({
      data: [
        { id: "1", name: "PB", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: true },
      ],
      isLoading: false,
    });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("PB"));
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("handles undefined playbooks data", () => {
    usePlaybooksMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });
    expect(screen.getByText("Inga säljmanus skapade ännu.")).toBeInTheDocument();
  });

  it("shows Nytt manus button in header", () => {
    usePlaybooksMock.mockReturnValue({
      data: [
        { id: "1", name: "PB", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false },
      ],
      isLoading: false,
    });
    render(<AdminPlaybookPage />, { wrapper: Wrapper });
    expect(screen.getByText("Nytt manus")).toBeInTheDocument();
  });
});
