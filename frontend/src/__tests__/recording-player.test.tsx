import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordingPlayer } from "@/components/recording-player";

const useRecordingUrlMock = vi.fn();

vi.mock("@/api/telavox", () => ({
  useRecordingUrl: (...args: unknown[]) => useRecordingUrlMock(...args),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("RecordingPlayer", () => {
  it("renders play button initially", () => {
    useRecordingUrlMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    expect(screen.getByText("Spela upp inspelning")).toBeInTheDocument();
  });

  it("does not show audio when collapsed", () => {
    useRecordingUrlMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    expect(screen.queryByText("Laddar...")).not.toBeInTheDocument();
    expect(screen.queryByText("Ingen inspelning")).not.toBeInTheDocument();
  });

  it("shows loading state when expanded and loading", () => {
    useRecordingUrlMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Spela upp inspelning"));
    expect(screen.getByText("Laddar...")).toBeInTheDocument();
  });

  it("shows audio player when recording URL is available", () => {
    useRecordingUrlMock.mockReturnValue({ data: { url: "https://example.com/recording.mp3" }, isLoading: false });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Spela upp inspelning"));
    const audio = document.querySelector("audio");
    expect(audio).toBeInTheDocument();
    expect(audio).toHaveAttribute("src", "https://example.com/recording.mp3");
  });

  it("shows Ingen inspelning when no URL", () => {
    useRecordingUrlMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Spela upp inspelning"));
    expect(screen.getByText("Ingen inspelning")).toBeInTheDocument();
  });

  it("toggles to Dölj inspelning when expanded", () => {
    useRecordingUrlMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Spela upp inspelning"));
    expect(screen.getByText("Dölj inspelning")).toBeInTheDocument();
  });

  it("collapses back when clicking Dölj inspelning", () => {
    useRecordingUrlMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Spela upp inspelning"));
    fireEvent.click(screen.getByText("Dölj inspelning"));
    expect(screen.getByText("Spela upp inspelning")).toBeInTheDocument();
    expect(screen.queryByText("Ingen inspelning")).not.toBeInTheDocument();
  });

  it("passes null to useRecordingUrl when collapsed", () => {
    useRecordingUrlMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    expect(useRecordingUrlMock).toHaveBeenCalledWith(null);
  });

  it("passes phoneCallId to useRecordingUrl when expanded", () => {
    useRecordingUrlMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Spela upp inspelning"));
    expect(useRecordingUrlMock).toHaveBeenCalledWith("pc1");
  });

  it("shows Ingen inspelning when data has no url", () => {
    useRecordingUrlMock.mockReturnValue({ data: { url: "" }, isLoading: false });
    render(<RecordingPlayer phoneCallId="pc1" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Spela upp inspelning"));
    expect(screen.getByText("Ingen inspelning")).toBeInTheDocument();
  });
});
