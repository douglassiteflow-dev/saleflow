import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMeetings, useCreateMeeting, useCancelMeeting } from "../meetings";
import type { ReactNode } from "react";

const originalFetch = globalThis.fetch;

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockMeeting = {
  id: "m1",
  lead_id: "l1",
  user_id: "u1",
  title: "Demo meeting",
  meeting_date: "2024-06-01",
  meeting_time: "14:00:00",
  notes: null,
  status: "scheduled",
  reminded_at: null,
  inserted_at: "2024-01-01T00:00:00Z",
};

describe("useMeetings", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("fetches all meetings", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ meetings: [mockMeeting] }),
    });

    const { result } = renderHook(() => useMeetings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockMeeting]);
  });
});

describe("useCreateMeeting", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("posts new meeting", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMeeting),
    });

    const { result } = renderHook(() => useCreateMeeting(), { wrapper: createWrapper() });
    result.current.mutate({
      lead_id: "l1",
      title: "Demo",
      meeting_date: "2024-06-01",
      meeting_time: "14:00",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/meetings", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("useCancelMeeting", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("posts cancel request", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockMeeting, status: "cancelled" }),
    });

    const { result } = renderHook(() => useCancelMeeting(), { wrapper: createWrapper() });
    result.current.mutate("m1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/meetings/m1/cancel", expect.objectContaining({
      method: "POST",
    }));
  });
});
