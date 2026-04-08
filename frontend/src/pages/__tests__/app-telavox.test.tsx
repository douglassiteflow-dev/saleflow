import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppTelavoxPage } from "../app-telavox";

vi.mock("@/components/telavox-connect", () => ({
  TelavoxConnect: () => <div data-testid="telavox-connect">TelavoxConnect</div>,
}));

vi.mock("@/components/live-calls", () => ({
  LiveCalls: () => <div data-testid="live-calls">LiveCalls</div>,
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("AppTelavoxPage", () => {
  it("renders Telavox heading", () => {
    render(<AppTelavoxPage />, { wrapper: Wrapper });
    expect(screen.getByText("Telavox")).toBeInTheDocument();
  });

  it("renders TelavoxConnect component", () => {
    render(<AppTelavoxPage />, { wrapper: Wrapper });
    expect(screen.getByTestId("telavox-connect")).toBeInTheDocument();
  });

  it("renders LiveCalls component", () => {
    render(<AppTelavoxPage />, { wrapper: Wrapper });
    expect(screen.getByTestId("live-calls")).toBeInTheDocument();
  });

  it("renders Telavox icon image", () => {
    render(<AppTelavoxPage />, { wrapper: Wrapper });
    const img = screen.getByAltText("Telavox");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/app-icons/telavox.jpeg");
  });
});
