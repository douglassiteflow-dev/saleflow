import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QuestionnairePage } from "../questionnaire";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useParams: () => ({ token: "test-token-123" }) };
});

vi.mock("@/api/questionnaire", () => ({
  fetchQuestionnaire: vi.fn(),
  saveAnswers: vi.fn(),
  completeQuestionnaire: vi.fn(),
  uploadMedia: vi.fn(),
}));

import {
  fetchQuestionnaire,
  saveAnswers,
  completeQuestionnaire,
} from "@/api/questionnaire";

const fetchMock = fetchQuestionnaire as ReturnType<typeof vi.fn>;
const saveMock = saveAnswers as ReturnType<typeof vi.fn>;
const completeMock = completeQuestionnaire as ReturnType<typeof vi.fn>;

const baseQuestionnaire = {
  id: "q1",
  deal_id: "d1",
  token: "test-token-123",
  status: "pending" as const,
  customer_email: "kund@test.se",
  capacity: null,
  color_theme: null,
  services_text: null,
  services_file_url: null,
  custom_changes: null,
  wants_ads: null,
  most_profitable_service: null,
  wants_quote_generator: null,
  addon_services: [],
  media_urls: [],
  completed_at: null,
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

describe("QuestionnairePage", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    saveMock.mockClear();
    completeMock.mockClear();
    saveMock.mockResolvedValue(baseQuestionnaire);
  });

  it("shows loading state initially", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<QuestionnairePage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar formulär...")).toBeInTheDocument();
  });

  it("renders step 1 (capacity) with all radio options", async () => {
    fetchMock.mockResolvedValue(baseQuestionnaire);
    render(<QuestionnairePage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Hur många fler kunder kan du hantera per dag?")).toBeInTheDocument(),
    );

    expect(screen.getByText("1-10")).toBeInTheDocument();
    expect(screen.getByText("10-20")).toBeInTheDocument();
    expect(screen.getByText("20-30")).toBeInTheDocument();
    expect(screen.getByText("30-40")).toBeInTheDocument();
    expect(screen.getByText("50-100")).toBeInTheDocument();
    expect(screen.getByText("Obegränsat")).toBeInTheDocument();
  });

  it("shows progress indicator", async () => {
    fetchMock.mockResolvedValue(baseQuestionnaire);
    render(<QuestionnairePage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText(/Steg 1 av 7/)).toBeInTheDocument(),
    );
  });

  it("Nästa button advances to step 2", async () => {
    fetchMock.mockResolvedValue(baseQuestionnaire);
    render(<QuestionnairePage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Hur många fler kunder kan du hantera per dag?")).toBeInTheDocument(),
    );

    // Select a capacity option first (required for step 1)
    fireEvent.click(screen.getByText("1-10"));

    // Click Nästa
    fireEvent.click(screen.getByText("Nästa"));

    await waitFor(() =>
      expect(screen.getByText(/Steg 2 av 7/)).toBeInTheDocument(),
    );
    expect(screen.getByText("Vill du ha någon specifik färg som tema?")).toBeInTheDocument();
  });

  it("Tillbaka returns to previous step", async () => {
    fetchMock.mockResolvedValue(baseQuestionnaire);
    render(<QuestionnairePage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Hur många fler kunder kan du hantera per dag?")).toBeInTheDocument(),
    );

    // Go to step 2
    fireEvent.click(screen.getByText("1-10"));
    fireEvent.click(screen.getByText("Nästa"));

    await waitFor(() =>
      expect(screen.getByText(/Steg 2 av 7/)).toBeInTheDocument(),
    );

    // Go back
    fireEvent.click(screen.getByText("Tillbaka"));

    await waitFor(() =>
      expect(screen.getByText(/Steg 1 av 7/)).toBeInTheDocument(),
    );
    expect(screen.getByText("Hur många fler kunder kan du hantera per dag?")).toBeInTheDocument();
  });

  it("step 5 shows all 11 add-on service cards", async () => {
    fetchMock.mockResolvedValue(baseQuestionnaire);
    render(<QuestionnairePage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Hur många fler kunder kan du hantera per dag?")).toBeInTheDocument(),
    );

    // Navigate to step 5 by clicking through steps 1-4
    fireEvent.click(screen.getByText("1-10"));
    fireEvent.click(screen.getByText("Nästa")); // → step 2
    await waitFor(() => expect(screen.getByText(/Steg 2 av 7/)).toBeInTheDocument());

    fireEvent.click(screen.getByText("Nästa")); // → step 3
    await waitFor(() => expect(screen.getByText(/Steg 3 av 7/)).toBeInTheDocument());

    fireEvent.click(screen.getByText("Nästa")); // → step 4
    await waitFor(() => expect(screen.getByText(/Steg 4 av 7/)).toBeInTheDocument());

    fireEvent.click(screen.getByText("Nästa")); // → step 5
    await waitFor(() => expect(screen.getByText(/Steg 5 av 7/)).toBeInTheDocument());

    // All 11 add-on service labels
    expect(screen.getByText("Professionell företags-email")).toBeInTheDocument();
    expect(screen.getByText("Företagsnummer / Växel")).toBeInTheDocument();
    expect(screen.getByText("AI-Receptionist")).toBeInTheDocument();
    expect(screen.getByText("Avancerad SEO")).toBeInTheDocument();
    expect(screen.getByText("Journalsystem / Journalkoppling")).toBeInTheDocument();
    expect(screen.getByText("Schemaläggning & Personal")).toBeInTheDocument();
    expect(screen.getByText("Bokningssystem")).toBeInTheDocument();
    expect(screen.getByText("Ta betalt online")).toBeInTheDocument();
    expect(screen.getByText("Webshop")).toBeInTheDocument();
    expect(screen.getByText("Betalda annonser")).toBeInTheDocument();
    expect(screen.getByText("Offertgenerering")).toBeInTheDocument();
  });

  it("shows thank-you page when status is completed", async () => {
    fetchMock.mockResolvedValue({
      ...baseQuestionnaire,
      status: "completed" as const,
      completed_at: "2024-01-01T10:00:00Z",
    });
    render(<QuestionnairePage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Tack! Vi återkommer när din hemsida är redo")).toBeInTheDocument(),
    );
    expect(screen.getByText("Dina svar har skickats in. Du kan stänga den här sidan.")).toBeInTheDocument();
  });

  it("shows error message for invalid token (fetch returns 404)", async () => {
    const err = Object.assign(new Error("Not Found"), { status: 404, name: "QuestionnaireApiError" });
    fetchMock.mockRejectedValue(err);

    render(<QuestionnairePage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText("Länken är ogiltig eller har utgått.")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Kontrollera att länken stämmer eller kontakta oss om du behöver hjälp."),
    ).toBeInTheDocument();
  });
});
