import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DailySummaryPage } from "../daily-summary";

const useDailySummaryMock = vi.fn();

vi.mock("@/api/daily-summary", () => ({
  useDailySummary: (date: string) => useDailySummaryMock(date),
}));

vi.mock("@/lib/date", () => ({
  todayISO: () => "2026-04-08",
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const mockCall = {
  outcome: "meeting_booked",
  agent: "Anna Agent",
  analysis: {
    voicemail: false,
    score: {
      overall: 8.5,
      opening: { score: 9 },
      needs_discovery: { score: 8 },
      pitch: { score: 8 },
      objection_handling: { score: 7 },
      closing: { score: 9 },
    },
    customer_needs: ["CRM-system"],
    objections: ["Dyr"],
    positive_signals: ["Intresserad"],
  },
};

describe("DailySummaryPage", () => {
  beforeEach(() => {
    useDailySummaryMock.mockReturnValue({ data: undefined, isLoading: true });
  });

  it("renders page heading", () => {
    render(<DailySummaryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Dagssammanfattning")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    useDailySummaryMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<DailySummaryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Laddar sammanfattning...")).toBeInTheDocument();
  });

  it("renders empty state when no calls", () => {
    useDailySummaryMock.mockReturnValue({ data: { calls: [] }, isLoading: false });
    render(<DailySummaryPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Inga analyserade samtal/)).toBeInTheDocument();
  });

  it("renders KPI cards when data is loaded", () => {
    useDailySummaryMock.mockReturnValue({ data: { calls: [mockCall] }, isLoading: false });
    render(<DailySummaryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Samtal")).toBeInTheDocument();
    expect(screen.getByText("Snittbetyg")).toBeInTheDocument();
    expect(screen.getByText("Möten")).toBeInTheDocument();
    expect(screen.getByText("Konvertering")).toBeInTheDocument();
  });

  it("renders agent performance when data loaded", () => {
    useDailySummaryMock.mockReturnValue({ data: { calls: [mockCall] }, isLoading: false });
    render(<DailySummaryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Anna Agent")).toBeInTheDocument();
  });

  it("renders score bars section", () => {
    useDailySummaryMock.mockReturnValue({ data: { calls: [mockCall] }, isLoading: false });
    render(<DailySummaryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Betygsöversikt")).toBeInTheDocument();
    expect(screen.getByText("Öppning")).toBeInTheDocument();
    expect(screen.getByText("Behovsanalys")).toBeInTheDocument();
    expect(screen.getByText("Pitch")).toBeInTheDocument();
  });

  it("renders navigation buttons", () => {
    useDailySummaryMock.mockReturnValue({ data: { calls: [] }, isLoading: false });
    render(<DailySummaryPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Föregående/)).toBeInTheDocument();
    expect(screen.getByText(/Nästa/)).toBeInTheDocument();
  });

  it("next button is disabled on today", () => {
    useDailySummaryMock.mockReturnValue({ data: { calls: [] }, isLoading: false });
    render(<DailySummaryPage />, { wrapper: Wrapper });
    const nextBtn = screen.getByText(/Nästa/).closest("button");
    expect(nextBtn).toBeDisabled();
  });

  it("navigates to previous day on Föregående click", () => {
    useDailySummaryMock.mockReturnValue({ data: { calls: [] }, isLoading: false });
    render(<DailySummaryPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/Föregående/));
    expect(useDailySummaryMock).toHaveBeenCalledWith("2026-04-07");
  });

  it("renders tag cloud sections", () => {
    useDailySummaryMock.mockReturnValue({ data: { calls: [mockCall] }, isLoading: false });
    render(<DailySummaryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Vanligaste kundbehov")).toBeInTheDocument();
    expect(screen.getByText("Vanligaste invändningar")).toBeInTheDocument();
    expect(screen.getByText("Positiva signaler")).toBeInTheDocument();
  });
});
