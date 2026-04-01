import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminImportPage } from "../admin-import";

const mutateAsyncMock = vi.fn();
const useImportLeadsMock = vi.fn();

vi.mock("@/api/admin", () => ({
  useImportLeads: () => useImportLeadsMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("AdminImportPage", () => {
  beforeEach(() => {
    useImportLeadsMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    });
  });

  it("renders page title", () => {
    render(<AdminImportPage />, { wrapper: Wrapper });
    expect(screen.getByText("Importera leads")).toBeInTheDocument();
  });

  it("renders file input and import button", () => {
    render(<AdminImportPage />, { wrapper: Wrapper });
    expect(screen.getByText("Excel-import")).toBeInTheDocument();
    expect(screen.getByText("Importera")).toBeInTheDocument();
  });

  it("shows error when no file is selected", async () => {
    render(<AdminImportPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Importera"));
    await waitFor(() => {
      expect(screen.getByText("Välj en Excel-fil (.xlsx) att importera.")).toBeInTheDocument();
    });
  });

  it("shows success result after import", async () => {
    mutateAsyncMock.mockResolvedValue({ created: 10, skipped: 2 });

    render(<AdminImportPage />, { wrapper: Wrapper });

    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(["test"], "leads.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText("Importera"));

    await waitFor(() => {
      expect(screen.getByText("Import slutförd")).toBeInTheDocument();
      expect(screen.getByText(/10 leads skapade/)).toBeInTheDocument();
    });
  });

  it("shows error on import failure", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("Upload failed"));

    render(<AdminImportPage />, { wrapper: Wrapper });

    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(["test"], "leads.xlsx");
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText("Importera"));

    await waitFor(() => {
      expect(screen.getByText("Upload failed")).toBeInTheDocument();
    });
  });

  it("shows pending state on import button", () => {
    useImportLeadsMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: true,
    });

    render(<AdminImportPage />, { wrapper: Wrapper });
    expect(screen.getByText("Importerar...")).toBeInTheDocument();
  });

  it("clears file input after successful import", async () => {
    mutateAsyncMock.mockResolvedValue({ created: 5, skipped: 0 });

    render(<AdminImportPage />, { wrapper: Wrapper });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["test"], "leads.xlsx");
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText("Importera"));

    await waitFor(() => {
      expect(screen.getByText("Import slutförd")).toBeInTheDocument();
    });
    // File input should be cleared
    expect(fileInput.value).toBe("");
  });

  it("renders description text", () => {
    render(<AdminImportPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Välj en .xlsx-fil/)).toBeInTheDocument();
  });

  it("shows fallback error when error has no message", async () => {
    mutateAsyncMock.mockRejectedValue({});

    render(<AdminImportPage />, { wrapper: Wrapper });

    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(["test"], "leads.xlsx");
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText("Importera"));

    await waitFor(() => {
      expect(screen.getByText("Import misslyckades.")).toBeInTheDocument();
    });
  });
});
