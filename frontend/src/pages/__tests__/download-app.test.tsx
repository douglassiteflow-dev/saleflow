import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DownloadAppPage } from "../download-app";

vi.mock("@/version", () => ({
  APP_VERSION: "1.19.0",
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("DownloadAppPage", () => {
  it("renders page heading", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    expect(screen.getByText("Saleflow Dialer")).toBeInTheDocument();
  });

  it("renders macOS download link", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    expect(screen.getByText("macOS")).toBeInTheDocument();
  });

  it("renders Windows download link", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    expect(screen.getByText("Windows")).toBeInTheDocument();
  });

  it("renders Linux download link", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    expect(screen.getByText("Linux")).toBeInTheDocument();
  });

  it("renders feature headings", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    expect(screen.getByText("Click-to-call")).toBeInTheDocument();
    expect(screen.getByText("Mötesbokning")).toBeInTheDocument();
    expect(screen.getByText("Notiser")).toBeInTheDocument();
  });

  it("renders version info", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Saleflow Dialer v1\.19\.0/)).toBeInTheDocument();
  });

  it("renders Saleflow logo image", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    const img = screen.getByAltText("Saleflow");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/app-icons/saleflow.png");
  });

  it("renders tagline description", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Den smarta dialern/)).toBeInTheDocument();
  });

  it("macOS link points to correct URL", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    const macLinks = screen.getAllByText(/Ladda ner för/);
    // Find the parent 'a' element for macOS
    const macLink = screen.getByText("macOS").closest("a");
    expect(macLink).toHaveAttribute("href", expect.stringContaining("arm64.dmg"));
  });

  it("Windows link points to correct URL", () => {
    render(<DownloadAppPage />, { wrapper: Wrapper });
    const winLink = screen.getByText("Windows").closest("a");
    expect(winLink).toHaveAttribute("href", expect.stringContaining(".exe"));
  });
});
