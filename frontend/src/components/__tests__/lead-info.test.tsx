import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeadInfo } from "../lead-info";
import type { Lead } from "@/api/types";

const baseLead: Lead = {
  id: "1",
  first_name: "Anna",
  last_name: "Svensson",
  company: "Test AB",
  phone: "+46701234567",
  email: "anna@test.se",
  status: "new",
  assigned_to: null,
  notes: "Some notes",
  priority: 1,
  callback_at: null,
  do_not_call: false,
  list_name: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("LeadInfo", () => {
  it("renders company name as title when present", () => {
    render(<LeadInfo lead={baseLead} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Test AB");
  });

  it("renders full name when company is null", () => {
    render(<LeadInfo lead={{ ...baseLead, company: null }} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Anna Svensson");
  });

  it("renders phone link", () => {
    render(<LeadInfo lead={baseLead} />);
    const link = screen.getByRole("link", { name: /070-123 45 67/ });
    expect(link).toHaveAttribute("href", "tel:+46701234567");
  });

  it("renders email link when present", () => {
    render(<LeadInfo lead={baseLead} />);
    const link = screen.getByRole("link", { name: "anna@test.se" });
    expect(link).toHaveAttribute("href", "mailto:anna@test.se");
  });

  it("does not render email row when email is null", () => {
    render(<LeadInfo lead={{ ...baseLead, email: null }} />);
    expect(screen.queryByText("anna@test.se")).not.toBeInTheDocument();
  });

  it("renders notes when present", () => {
    render(<LeadInfo lead={baseLead} />);
    expect(screen.getByText("Some notes")).toBeInTheDocument();
  });

  it("does not render notes row when notes is null", () => {
    render(<LeadInfo lead={{ ...baseLead, notes: null }} />);
    expect(screen.queryByText("Anteckningar")).not.toBeInTheDocument();
  });

  it("renders status badge", () => {
    render(<LeadInfo lead={baseLead} />);
    expect(screen.getByText("Ny")).toBeInTheDocument();
  });

  it("renders extended fields when present", () => {
    const extLead = {
      ...baseLead,
      org_number: "556000-1234",
      address: "Testgatan 1",
      zip: "12345",
      city: "Stockholm",
      industry: "IT",
      revenue: 5000000,
      profit: 500000,
      employees: 25,
      ceo: "Erik CEO",
      company_type: "AB",
    };
    render(<LeadInfo lead={extLead} />);
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
    const lead = { ...baseLead, org_number: "" };
    render(<LeadInfo lead={lead} />);
    // "Org.nr" label should not render
    expect(screen.queryByText("Org.nr")).not.toBeInTheDocument();
  });
});
