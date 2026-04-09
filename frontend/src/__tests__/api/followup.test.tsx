import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBookFollowup, usePreviewFollowupMail } from "@/api/followup";

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePreviewFollowupMail", () => {
  it("fetches preview HTML with language param", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ subject: "Uppföljning — X", html: "<h1>Hej</h1>" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(
      () =>
        usePreviewFollowupMail("dc-1", {
          meeting_date: "2026-04-16",
          meeting_time: "14:00",
          personal_message: "Tack",
          language: "sv",
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.html).toContain("Hej");
    expect(fetchSpy.mock.calls[0][0]).toContain("language=sv");
    expect(fetchSpy.mock.calls[0][0]).toContain("meeting_date=2026-04-16");
  });

  it("passes English language correctly", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ subject: "Follow-up — X", html: "<h1>Hi</h1>" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(
      () =>
        usePreviewFollowupMail("dc-1", {
          meeting_date: "2026-04-16",
          meeting_time: "14:00",
          personal_message: "Thanks",
          language: "en",
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.subject).toContain("Follow-up");
    expect(fetchSpy.mock.calls[0][0]).toContain("language=en");
  });

  it("does not fetch when date or time is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(
      () =>
        usePreviewFollowupMail("dc-1", {
          meeting_date: "",
          meeting_time: "",
          personal_message: "",
          language: "sv",
        }),
      { wrapper: createWrapper() },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("does not fetch when demoConfigId is null", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderHook(
      () =>
        usePreviewFollowupMail(null, {
          meeting_date: "2026-04-16",
          meeting_time: "14:00",
          personal_message: "",
          language: "sv",
        }),
      { wrapper: createWrapper() },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("useBookFollowup", () => {
  it("posts with language and returns demo_config + meeting + questionnaire", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          demo_config: { id: "dc-1", stage: "followup" },
          meeting: { id: "m-1", title: "Uppföljning — X", teams_join_url: "https://teams.url/x" },
          questionnaire: { id: "q-1", token: "tok", lead_id: "lead-1" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { result } = renderHook(() => useBookFollowup(), { wrapper: createWrapper() });
    result.current.mutate({
      id: "dc-1",
      meeting_date: "2026-04-16",
      meeting_time: "14:00",
      personal_message: "Hej",
      language: "sv",
      email: "kund@test.se",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.demo_config.stage).toBe("followup");
    expect(result.current.data?.meeting.teams_join_url).toBe("https://teams.url/x");

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.language).toBe("sv");
    expect(body.meeting_date).toBe("2026-04-16");
    expect(body.meeting_time).toBe("14:00");
    expect(body.email).toBe("kund@test.se");
  });

  it("handles error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "No Microsoft connection" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useBookFollowup(), { wrapper: createWrapper() });
    result.current.mutate({
      id: "dc-1",
      meeting_date: "2026-04-16",
      meeting_time: "14:00",
      personal_message: "",
      language: "sv",
      email: "kund@test.se",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
