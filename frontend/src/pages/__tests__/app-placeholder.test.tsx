import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppPlaceholderPage } from "../app-placeholder";

function renderPage(slug: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/apps/${slug}`]}>
        <Routes>
          <Route path="/apps/:slug" element={<AppPlaceholderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppPlaceholderPage", () => {
  it("renders known app name for genflow", () => {
    renderPage("genflow");
    expect(screen.getByText("Genflow")).toBeInTheDocument();
  });

  it("renders description for genflow", () => {
    renderPage("genflow");
    expect(screen.getByText("Generera professionella hemsidor för dina kunder")).toBeInTheDocument();
  });

  it("renders 'Kommer snart' card", () => {
    renderPage("genflow");
    expect(screen.getByText("Kommer snart")).toBeInTheDocument();
  });

  it("renders icon image for known app", () => {
    renderPage("genflow");
    const img = screen.getByAltText("Genflow");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/app-icons/genflow.png");
  });

  it("renders signflow correctly", () => {
    renderPage("signflow");
    expect(screen.getByText("Signflow")).toBeInTheDocument();
    expect(screen.getByText("Skapa offerter och avtal, skicka för signering")).toBeInTheDocument();
  });

  it("renders leadflow correctly", () => {
    renderPage("leadflow");
    expect(screen.getByText("Leadflow")).toBeInTheDocument();
  });

  it("renders slug as heading for unknown app", () => {
    renderPage("unknown-app");
    expect(screen.getByText("unknown-app")).toBeInTheDocument();
  });

  it("renders fallback description for unknown app", () => {
    renderPage("unknown-app");
    expect(screen.getByText("Appen laddas...")).toBeInTheDocument();
  });

  it("does not render image for unknown app", () => {
    renderPage("unknown-app");
    const imgs = screen.queryAllByRole("img");
    expect(imgs).toHaveLength(0);
  });
});
