import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { ContractSigningPage } from "../contract-signing";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useParams: () => ({ token: "test-token-abc" }) };
});

vi.mock("@/api/contract-public", () => ({
  fetchContract: vi.fn(),
  verifyContract: vi.fn(),
  signContract: vi.fn(),
  downloadPdf: vi.fn(),
  updateTracking: vi.fn(),
}));

// Stub SignatureCanvas so tests don't need real canvas drawing.
vi.mock("@/components/signature-canvas", () => ({
  SignatureCanvas: ({ onSignatureChange }: { onSignatureChange: (v: string | null) => void }) => (
    <div>
      <button
        type="button"
        data-testid="mock-signature-trigger"
        onClick={() => onSignatureChange("data:image/png;base64,MOCK")}
      >
        Signera här (mock)
      </button>
    </div>
  ),
}));

import {
  fetchContract,
  verifyContract,
} from "@/api/contract-public";

const fetchMock = fetchContract as ReturnType<typeof vi.fn>;
const verifyMock = verifyContract as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Base contract fixture
// ---------------------------------------------------------------------------

const baseContract = {
  id: "ctr-1",
  contract_number: "SF-2026-001",
  status: "sent" as const,
  amount: 5000,
  currency: "SEK",
  terms: "Standardvillkor gäller.",
  seller_name: "Anna Sälj",
  seller_signed_at: "2026-04-01T10:00:00Z",
  recipient_name: "Testbolaget AB",
  recipient_email: "test@testbolaget.se",
  customer_name: null,
  customer_signed_at: null,
  signed_pdf_url: null,
  access_token: "tok-123",
  expires_at: null,
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

// ---------------------------------------------------------------------------
// IntersectionObserver stub — must be a proper class for `new` to work
// ---------------------------------------------------------------------------

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_callback: any, _options?: any) {}
}

beforeEach(() => {
  fetchMock.mockReset();
  verifyMock.mockReset();

  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });

  // Stub setInterval so the 5s tracking timer never fires in tests
  vi.spyOn(window, "setInterval").mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);
  vi.spyOn(window, "clearInterval").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ContractSigningPage", () => {
  // 1. Loading state
  it("shows loading state initially", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ContractSigningPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar avtal...")).toBeInTheDocument();
  });

  // 2. Verify form when status is "sent"
  it("shows verification form when contract status is 'sent'", async () => {
    fetchMock.mockResolvedValue(baseContract);
    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Verifiera din identitet")).toBeInTheDocument(),
    );

    expect(screen.getByText(/Avtal SF-2026-001 till Testbolaget AB/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verifiera" })).toBeInTheDocument();
  });

  // 3. Error for invalid token
  it("shows error screen for invalid token when fetchContract rejects", async () => {
    const err = new Error("Länken är ogiltig eller har gått ut.");
    fetchMock.mockRejectedValue(err);

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Avtalet hittades inte")).toBeInTheDocument(),
    );
    expect(screen.getByText("Länken är ogiltig eller har gått ut.")).toBeInTheDocument();
  });

  // 4. Expired contract
  it("shows expired message for expired contract", async () => {
    fetchMock.mockResolvedValue({
      ...baseContract,
      expires_at: "2020-01-01T00:00:00Z", // in the past
    });

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Avtalet har gått ut")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Kontakta din säljare för ett nytt avtal/)).toBeInTheDocument();
  });

  // 5. Wrong verification code shows error
  it("shows error message when wrong verification code is submitted", async () => {
    fetchMock.mockResolvedValue(baseContract);
    verifyMock.mockRejectedValue(new Error("Felaktig verifieringskod"));

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByPlaceholderText("000000")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByPlaceholderText("000000"), {
      target: { value: "123456" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Verifiera" }));

    await waitFor(() =>
      expect(screen.getByText("Felaktig verifieringskod")).toBeInTheDocument(),
    );
  });

  // 6. Correct code transitions to view state
  it("transitions to view state after correct verification code", async () => {
    fetchMock.mockResolvedValue(baseContract);
    verifyMock.mockResolvedValue({ ...baseContract, status: "viewed" as const });

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByPlaceholderText("000000")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByPlaceholderText("000000"), {
      target: { value: "654321" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Verifiera" }));

    await waitFor(() =>
      expect(screen.getByText("Prisöversikt")).toBeInTheDocument(),
    );
  });

  // 7. View state shows all 4 sections
  it("view state shows all 4 sections (försättsblad, prisöversikt, villkor, signering)", async () => {
    fetchMock.mockResolvedValue({ ...baseContract, status: "viewed" as const });

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Avtal" })).toBeInTheDocument(),
    );

    // Försättsblad: "Testbolaget AB" as recipient appears on cover
    expect(screen.getAllByText("Testbolaget AB").length).toBeGreaterThanOrEqual(1);

    // Section headings for the other three sections
    expect(screen.getByRole("heading", { name: "Prisöversikt" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Villkor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Signering" })).toBeInTheDocument();
  });

  // 8. Amount formatted as Swedish currency
  it("formats amount as Swedish currency (5 000 kr)", async () => {
    fetchMock.mockResolvedValue({ ...baseContract, status: "viewed" as const });

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Prisöversikt" })).toBeInTheDocument(),
    );

    expect(screen.getByText("5 000 kr")).toBeInTheDocument();
  });

  // 9. Seller name and signature date visible
  it("shows seller name and signature date in view state", async () => {
    fetchMock.mockResolvedValue({ ...baseContract, status: "viewed" as const });

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Signering" })).toBeInTheDocument(),
    );

    // Seller name appears in the signature section
    const sellerNames = screen.getAllByText("Anna Sälj");
    expect(sellerNames.length).toBeGreaterThanOrEqual(1);

    // Date should be formatted as Swedish: "1 april 2026"
    expect(screen.getByText(/1 april 2026/)).toBeInTheDocument();
  });

  // 10. "Signera avtal" button disabled until name + email + signature filled
  it("'Signera avtal' button is disabled until name, email and signature are provided", async () => {
    fetchMock.mockResolvedValue({ ...baseContract, status: "viewed" as const });

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Signera avtal" })).toBeInTheDocument(),
    );

    const signBtn = screen.getByRole("button", { name: "Signera avtal" });

    // Initially disabled (no name, email, or signature)
    expect(signBtn).toBeDisabled();

    // Fill in name only — still disabled
    fireEvent.change(screen.getByPlaceholderText("Ditt fullständiga namn"), {
      target: { value: "Kund Kundsson" },
    });
    expect(signBtn).toBeDisabled();

    // Fill in email — still disabled (no signature)
    fireEvent.change(screen.getByPlaceholderText("din@epost.se"), {
      target: { value: "kund@bolaget.se" },
    });
    expect(signBtn).toBeDisabled();

    // Simulate drawing on signature canvas via mock trigger
    await act(async () => {
      fireEvent.click(screen.getByTestId("mock-signature-trigger"));
    });

    // Now all three filled — button should be enabled
    await waitFor(() =>
      expect(signBtn).not.toBeDisabled(),
    );
  });

  // 11. Shows thank-you page when contract already signed
  it("shows thank-you page when contract status is 'signed'", async () => {
    fetchMock.mockResolvedValue({
      ...baseContract,
      status: "signed" as const,
      customer_name: "Kund Kundsson",
      customer_signed_at: "2026-04-08T12:00:00Z",
    });

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Tack! Ditt avtal är signerat.")).toBeInTheDocument(),
    );

    expect(screen.getByText(/SF-2026-001 har signerats framgångsrikt/)).toBeInTheDocument();
  });

  // 12. PDF download button on done state
  it("shows PDF download button on done state", async () => {
    fetchMock.mockResolvedValue({
      ...baseContract,
      status: "signed" as const,
      customer_name: "Kund Kundsson",
      customer_signed_at: "2026-04-08T12:00:00Z",
    });

    render(<ContractSigningPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Ladda ner avtal/ })).toBeInTheDocument(),
    );
  });
});
