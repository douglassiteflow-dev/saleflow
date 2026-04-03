import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeadInfo } from "../lead-info";
import type { Lead } from "@/api/types";

vi.mock("@/api/telavox", () => ({
  useTelavoxStatus: vi.fn(() => ({ data: undefined })),
  useDial: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useHangup: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseLead: Lead = {
  id: "1",
  företag: "Test AB",
  telefon: "+46701234567",
  epost: "anna@test.se",
  hemsida: null,
  adress: null,
  postnummer: null,
  stad: null,
  bransch: null,
  orgnr: null,
  omsättning_tkr: null,
  vinst_tkr: null,
  anställda: null,
  vd_namn: null,
  bolagsform: null,
  status: "new",
  quarantine_until: null,
  callback_at: null,
  callback_reminded_at: null,
  imported_at: null,
  inserted_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("LeadInfo", () => {
  it("renders company name as title when present", () => {
    render(<LeadInfo lead={baseLead} />, { wrapper: Wrapper });
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Test AB");
  });

  it("renders phone link", () => {
    render(<LeadInfo lead={baseLead} />, { wrapper: Wrapper });
    const link = screen.getByRole("link", { name: /070-123 45 67/ });
    expect(link).toHaveAttribute("href", "tel:+46701234567");
  });

  it("renders email link when present", () => {
    render(<LeadInfo lead={baseLead} />, { wrapper: Wrapper });
    const link = screen.getByRole("link", { name: "anna@test.se" });
    expect(link).toHaveAttribute("href", "mailto:anna@test.se");
  });

  it("does not render email row when email is null", () => {
    render(<LeadInfo lead={{ ...baseLead, epost: null }} />, { wrapper: Wrapper });
    expect(screen.queryByText("anna@test.se")).not.toBeInTheDocument();
  });

  it("renders status badge", () => {
    render(<LeadInfo lead={baseLead} />, { wrapper: Wrapper });
    expect(screen.getByText("Ny")).toBeInTheDocument();
  });

  it("renders extended fields when present", () => {
    const extLead: Lead = {
      ...baseLead,
      orgnr: "556000-1234",
      adress: "Testgatan 1",
      postnummer: "12345",
      stad: "Stockholm",
      bransch: "IT",
      omsättning_tkr: "5000",
      vinst_tkr: "500",
      anställda: "25",
      vd_namn: "Erik CEO",
      bolagsform: "AB",
    };
    render(<LeadInfo lead={extLead} />, { wrapper: Wrapper });
    expect(screen.getByText("556000-1234")).toBeInTheDocument();
    expect(screen.getByText("Testgatan 1")).toBeInTheDocument();
    expect(screen.getByText("12345")).toBeInTheDocument();
    expect(screen.getByText("Stockholm")).toBeInTheDocument();
    expect(screen.getByText("IT")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("Erik CEO")).toBeInTheDocument();
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("skips InfoRow when value is empty string", () => {
    const lead: Lead = { ...baseLead, orgnr: "" };
    render(<LeadInfo lead={lead} />, { wrapper: Wrapper });
    // "Org.nr" label should not render
    expect(screen.queryByText("Org.nr")).not.toBeInTheDocument();
  });
});
