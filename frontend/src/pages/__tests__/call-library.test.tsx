import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CallLibraryPage } from "../call-library";

const useCallSearchMock = vi.fn();
vi.mock("@/api/call-search", () => ({
  useCallSearch: (...args: unknown[]) => useCallSearchMock(...args),
}));

vi.useFakeTimers();

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

/** Type input into the main search box and flush the 300ms debounce. */
function typeSearch(value: string) {
  const input = screen.getByRole("searchbox", { name: /sök samtal/i });
  fireEvent.change(input, { target: { value } });
  act(() => { vi.advanceTimersByTime(350); });
}

const sampleResults = [
  {
    id: "r1",
    received_at: "2024-03-15T10:00:00Z",
    duration: 125,
    scorecard_avg: 7.5,
    sentiment: "POSITIVE",
    summary: "Kunden var intresserad av tjänsten.",
    outcome: "meeting_booked",
    agent_name: "Anna B",
    snippet: "Hej, jag ringer från <mark>Saleflow</mark> angående din hemsida.",
  },
  {
    id: "r2",
    received_at: "2024-03-14T09:00:00Z",
    duration: 60,
    scorecard_avg: null,
    sentiment: null,
    summary: null,
    outcome: "no_answer",
    agent_name: "Erik S",
    snippet: "Inget svar på <mark>samtalet</mark>.",
  },
];

describe("CallLibraryPage", () => {
  beforeEach(() => {
    useCallSearchMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("renders search input", () => {
    render(<CallLibraryPage />, { wrapper: Wrapper });
    expect(screen.getByRole("searchbox", { name: /sök samtal/i })).toBeInTheDocument();
  });

  it("renders page heading", () => {
    render(<CallLibraryPage />, { wrapper: Wrapper });
    expect(screen.getByText("Samtalsbibliotek")).toBeInTheDocument();
  });

  it("shows empty state when query is shorter than 2 characters", () => {
    render(<CallLibraryPage />, { wrapper: Wrapper });
    expect(
      screen.getByText("Sök i samtalshistorik — skriv minst 2 tecken"),
    ).toBeInTheDocument();
  });

  it("shows empty state when query is exactly 1 character", () => {
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("a");
    expect(
      screen.getByText("Sök i samtalshistorik — skriv minst 2 tecken"),
    ).toBeInTheDocument();
  });

  it("shows loading state while searching", () => {
    useCallSearchMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("Saleflow");
    expect(screen.getByText("Söker samtal...")).toBeInTheDocument();
  });

  it("shows results after search", () => {
    useCallSearchMock.mockReturnValue({ data: sampleResults, isLoading: false });
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("Saleflow");
    expect(screen.getByText("Anna B")).toBeInTheDocument();
    expect(screen.getByText("Erik S")).toBeInTheDocument();
    expect(screen.getByText("2 träffar")).toBeInTheDocument();
  });

  it("renders highlighted snippets via dangerouslySetInnerHTML", () => {
    useCallSearchMock.mockReturnValue({ data: sampleResults, isLoading: false });
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("Saleflow");
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]!.textContent).toBe("Saleflow");
  });

  it("shows empty results message when search returns no results", () => {
    useCallSearchMock.mockReturnValue({ data: [], isLoading: false });
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("xyz123");
    expect(screen.getByText(/Inga samtal hittades/)).toBeInTheDocument();
  });

  it("renders outcome badge", () => {
    useCallSearchMock.mockReturnValue({ data: sampleResults, isLoading: false });
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("Saleflow");
    const badges = screen.getAllByText("Möte bokat");
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ej svar").length).toBeGreaterThanOrEqual(1);
  });

  it("formats duration correctly", () => {
    useCallSearchMock.mockReturnValue({ data: sampleResults, isLoading: false });
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("Saleflow");
    // 125 seconds = 2m 5s
    expect(screen.getByText("2m 5s")).toBeInTheDocument();
    // 60 seconds = 1m 0s
    expect(screen.getByText("1m 0s")).toBeInTheDocument();
  });

  it("play button links to recording endpoint", () => {
    useCallSearchMock.mockReturnValue({ data: sampleResults, isLoading: false });
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("Saleflow");
    const playLinks = screen.getAllByRole("link", { name: /spela upp inspelning/i });
    expect(playLinks.length).toBe(2);
    expect(playLinks[0]).toHaveAttribute("href", "/api/calls/r1/recording");
    expect(playLinks[1]).toHaveAttribute("href", "/api/calls/r2/recording");
  });

  it("passes agent filter to useCallSearch", () => {
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("hej");
    const agentInput = screen.getByRole("textbox", { name: /filtrera på agent/i });
    fireEvent.change(agentInput, { target: { value: "Anna" } });
    const lastCall = useCallSearchMock.mock.calls[useCallSearchMock.mock.calls.length - 1] as [string, Record<string, string>];
    expect(lastCall[1]).toMatchObject({ agent: "Anna" });
  });

  it("passes outcome filter to useCallSearch", () => {
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("hej");
    const outcomeSelect = screen.getByRole("combobox", { name: /filtrera på utfall/i });
    fireEvent.change(outcomeSelect, { target: { value: "meeting_booked" } });
    const lastCall = useCallSearchMock.mock.calls[useCallSearchMock.mock.calls.length - 1] as [string, Record<string, string>];
    expect(lastCall[1]).toMatchObject({ outcome: "meeting_booked" });
  });

  it("passes date filters to useCallSearch", () => {
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("hej");
    const dateFrom = document.querySelector('input[aria-label="Datum från"]') as HTMLInputElement;
    const dateTo = document.querySelector('input[aria-label="Datum till"]') as HTMLInputElement;
    fireEvent.change(dateFrom, { target: { value: "2024-03-01" } });
    fireEvent.change(dateTo, { target: { value: "2024-03-31" } });
    const lastCall = useCallSearchMock.mock.calls[useCallSearchMock.mock.calls.length - 1] as [string, Record<string, string>];
    expect(lastCall[1]).toMatchObject({ from: "2024-03-01", to: "2024-03-31" });
  });

  it("passes min score filter to useCallSearch", () => {
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("hej");
    const minScoreInput = screen.getByRole("spinbutton", { name: /minsta betyg/i });
    fireEvent.change(minScoreInput, { target: { value: "6" } });
    const lastCall = useCallSearchMock.mock.calls[useCallSearchMock.mock.calls.length - 1] as [string, Record<string, string>];
    expect(lastCall[1]).toMatchObject({ min_score: "6" });
  });

  it("shows scorecard average when available", () => {
    useCallSearchMock.mockReturnValue({ data: sampleResults, isLoading: false });
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("Saleflow");
    expect(screen.getByText("7.5")).toBeInTheDocument();
  });

  it("renders summary when available", () => {
    useCallSearchMock.mockReturnValue({ data: sampleResults, isLoading: false });
    render(<CallLibraryPage />, { wrapper: Wrapper });
    typeSearch("Saleflow");
    expect(screen.getByText("Kunden var intresserad av tjänsten.")).toBeInTheDocument();
  });
});
