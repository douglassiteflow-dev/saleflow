import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerModalInfo } from "@/components/dialer/customer-modal-info";
import type { Lead } from "@/api/types";

const mutateLead = vi.fn();
const mutateContact = vi.fn();

vi.mock("@/api/leads", () => ({
  useUpdateLead: vi.fn(() => ({
    mutate: mutateLead,
    isPending: false,
  })),
}));

vi.mock("@/api/contacts", () => ({
  useContacts: vi.fn(() => ({
    data: [
      { id: "c1", lead_id: "lead-1", name: "Erik Ek", role: "VD", phone: "+46701112233", email: null },
      { id: "c2", lead_id: "lead-1", name: "Lisa Lind", role: null, phone: null, email: null },
    ],
  })),
  useCreateContact: vi.fn(() => ({
    mutate: mutateContact,
    isPending: false,
  })),
}));

vi.mock("@/components/dialer/lead-comments", () => ({
  LeadComments: ({ leadId }: { leadId: string }) => (
    <div data-testid="lead-comments">Comments for {leadId}</div>
  ),
}));

const SAMPLE_LEAD: Lead = {
  id: "lead-1",
  företag: "Testföretag AB",
  telefon: "+46701234567",
  telefon_2: "+46709876543",
  epost: "info@test.se",
  hemsida: "https://test.se",
  adress: "Storgatan 1",
  postnummer: "11122",
  stad: "Stockholm",
  bransch: "IT",
  orgnr: "5566778899",
  omsättning_tkr: "5000",
  vinst_tkr: "800",
  anställda: "25",
  vd_namn: "Anna Svensson",
  bolagsform: "AB",
  källa: "Import",
  status: "assigned",
  quarantine_until: null,
  callback_at: null,
  callback_reminded_at: null,
  imported_at: "2026-03-15T10:00:00Z",
  inserted_at: "2026-03-15T10:00:00Z",
  updated_at: "2026-03-15T10:00:00Z",
};

const defaultProps = {
  lead: SAMPLE_LEAD,
  leadId: "lead-1",
  onDial: vi.fn(),
};

describe("CustomerModalInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders phone numbers with Ring buttons", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    // Both phone numbers are shown (formatted)
    expect(screen.getByText("070-123 45 67")).toBeInTheDocument();
    expect(screen.getByText("070-987 65 43")).toBeInTheDocument();

    // Tags
    expect(screen.getByText("Huvud")).toBeInTheDocument();
    expect(screen.getByText("Tillagd")).toBeInTheDocument();

    // Both have Ring buttons
    const ringButtons = screen.getAllByText("Ring");
    expect(ringButtons).toHaveLength(2);
  });

  it("calls onDial when Ring button is clicked", async () => {
    const user = userEvent.setup();
    const onDial = vi.fn();
    render(<CustomerModalInfo {...defaultProps} onDial={onDial} />);

    const ringButtons = screen.getAllByText("Ring");
    await user.click(ringButtons[0]);

    expect(onDial).toHaveBeenCalledWith("+46701234567");
  });

  it("shows active phone number with Pågår indicator instead of Ring", () => {
    render(
      <CustomerModalInfo
        {...defaultProps}
        activePhoneNumber="+46701234567"
      />,
    );

    expect(screen.getByText("● Pågår")).toBeInTheDocument();
    // Only one Ring button (for the second number)
    const ringButtons = screen.getAllByText("Ring");
    expect(ringButtons).toHaveLength(1);
  });

  it("shows InlineEditField for epost", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    // The InlineEditField renders the value as a span with role="button"
    expect(screen.getByText("info@test.se")).toBeInTheDocument();
  });

  it("shows InlineEditField for hemsida with link indicator", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    expect(screen.getByText("https://test.se ↗")).toBeInTheDocument();
  });

  it("shows read-only fields (adress, bransch, etc.)", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    expect(screen.getByText("Storgatan 1")).toBeInTheDocument();
    expect(screen.getByText("11122")).toBeInTheDocument();
    expect(screen.getByText("Stockholm")).toBeInTheDocument();
    expect(screen.getByText("IT")).toBeInTheDocument();
    expect(screen.getByText("5000 tkr")).toBeInTheDocument();
    expect(screen.getByText("Anna Svensson")).toBeInTheDocument();
    expect(screen.getByText("5566778899")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("800 tkr")).toBeInTheDocument();
    expect(screen.getByText("AB")).toBeInTheDocument();
    expect(screen.getByText("Import")).toBeInTheDocument();
  });

  it("renders Org.nr with mono font", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    const orgnrValue = screen.getByText("5566778899");
    expect(orgnrValue.className).toMatch(/font-mono/);
  });

  it("renders contacts list", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    expect(screen.getByText("Erik Ek")).toBeInTheDocument();
    // "VD" appears both as the kundinfo label and contact role
    const vdMatches = screen.getAllByText("VD");
    expect(vdMatches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Lisa Lind")).toBeInTheDocument();
  });

  it("renders comments section via LeadComments", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    const comments = screen.getByTestId("lead-comments");
    expect(comments).toBeInTheDocument();
    expect(comments).toHaveTextContent("Comments for lead-1");
  });

  it("shows 'Lägg till nummer' button when telefon_2 is null", () => {
    const leadWithoutPhone2 = { ...SAMPLE_LEAD, telefon_2: null };
    render(<CustomerModalInfo {...defaultProps} lead={leadWithoutPhone2} />);

    expect(screen.getByText("+ Lägg till nummer")).toBeInTheDocument();
  });

  it("does not show 'Lägg till nummer' when telefon_2 exists", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    expect(screen.queryByText("+ Lägg till nummer")).not.toBeInTheDocument();
  });

  it("shows add phone input when 'Lägg till nummer' is clicked", async () => {
    const user = userEvent.setup();
    const leadWithoutPhone2 = { ...SAMPLE_LEAD, telefon_2: null };
    render(<CustomerModalInfo {...defaultProps} lead={leadWithoutPhone2} />);

    await user.click(screen.getByText("+ Lägg till nummer"));

    expect(screen.getByPlaceholderText("+46...")).toBeInTheDocument();
  });

  it("shows add contact form when button is clicked", async () => {
    const user = userEvent.setup();
    render(<CustomerModalInfo {...defaultProps} />);

    await user.click(screen.getByText("+ Lägg till kontaktperson"));

    expect(screen.getByPlaceholderText("Namn")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Roll")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Telefon")).toBeInTheDocument();
  });

  it("calls useUpdateLead when epost InlineEditField saves", async () => {
    const user = userEvent.setup();
    render(<CustomerModalInfo {...defaultProps} />);

    // Click to edit
    await user.click(screen.getByText("info@test.se"));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "ny@test.se");
    await user.keyboard("{Enter}");

    expect(mutateLead).toHaveBeenCalledWith({ epost: "ny@test.se" });
  });

  it("calls useUpdateLead when hemsida InlineEditField saves", async () => {
    const user = userEvent.setup();
    render(<CustomerModalInfo {...defaultProps} />);

    // Click to edit (hemsida has link indicator)
    await user.click(screen.getByText("https://test.se ↗"));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "https://new.se");
    await user.keyboard("{Enter}");

    expect(mutateLead).toHaveBeenCalledWith({ hemsida: "https://new.se" });
  });

  it("shows placeholder for empty epost", () => {
    const leadNoEmail = { ...SAMPLE_LEAD, epost: null };
    render(<CustomerModalInfo {...defaultProps} lead={leadNoEmail} />);

    expect(screen.getByText("Lägg till e-post")).toBeInTheDocument();
  });

  it("shows placeholder for empty hemsida", () => {
    const leadNoWeb = { ...SAMPLE_LEAD, hemsida: null };
    render(<CustomerModalInfo {...defaultProps} lead={leadNoWeb} />);

    expect(screen.getByText("Lägg till hemsida")).toBeInTheDocument();
  });

  it("hides optional fields when null", () => {
    const minimalLead: Lead = {
      ...SAMPLE_LEAD,
      adress: null,
      postnummer: null,
      stad: null,
      bransch: null,
      omsättning_tkr: null,
      vinst_tkr: null,
      anställda: null,
      vd_namn: null,
      bolagsform: null,
      källa: null,
    };
    render(<CustomerModalInfo {...defaultProps} lead={minimalLead} />);

    // These labels should not appear when values are null
    expect(screen.queryByText("Storgatan 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Stockholm")).not.toBeInTheDocument();
    expect(screen.queryByText("IT")).not.toBeInTheDocument();
  });

  it("renders section headers", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    expect(screen.getByText("Telefonnummer")).toBeInTheDocument();
    expect(screen.getByText("Kundinfo")).toBeInTheDocument();
    expect(screen.getByText("Kontaktpersoner")).toBeInTheDocument();
  });

  it("renders two-column layout", () => {
    render(<CustomerModalInfo {...defaultProps} />);

    const container = screen.getByTestId("info-tab");
    expect(container.className).toMatch(/grid/);
    expect(container.className).toMatch(/grid-cols-1/);
    expect(container.className).toMatch(/lg:grid-cols-2/);
  });
});
