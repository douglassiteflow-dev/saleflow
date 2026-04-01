import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMySessions, useLogoutAll, useUserSessions, useForceLogoutUser, useForceLogoutSession } from "../sessions";
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

describe("useMySessions", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches sessions and returns array", async () => {
    const sessions = [
      { id: "s1", device_type: "desktop", browser: "Chrome", city: "Stockholm", country: "Sverige", logged_in_at: "2026-03-31T10:00:00Z", last_active_at: "2026-03-31T10:00:00Z", force_logged_out: false, current: true },
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessions }),
    });

    const { result } = renderHook(() => useMySessions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sessions);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/sessions", expect.any(Object));
  });
});

describe("useLogoutAll", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends logout-all request", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(undefined),
    });

    const { result } = renderHook(() => useLogoutAll(), { wrapper: createWrapper() });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/sessions/logout-all", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("useUserSessions", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches user sessions by userId", async () => {
    const sessions = [
      { id: "s1", device_type: "desktop", browser: "Firefox", city: null, country: null, logged_in_at: "2026-03-31T10:00:00Z", last_active_at: "2026-03-31T10:00:00Z", force_logged_out: false, current: false },
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessions }),
    });

    const { result } = renderHook(() => useUserSessions("user-123"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sessions);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/admin/users/user-123/sessions", expect.any(Object));
  });

  it("does not fetch when userId is empty", () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessions: [] }),
    });

    renderHook(() => useUserSessions(""), { wrapper: createWrapper() });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("useForceLogoutUser", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends force-logout request for user", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(undefined),
    });

    const { result } = renderHook(() => useForceLogoutUser(), { wrapper: createWrapper() });
    result.current.mutate("user-123");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/admin/users/user-123/force-logout", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("useForceLogoutSession", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends force-logout request for session", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(undefined),
    });

    const { result } = renderHook(() => useForceLogoutSession(), { wrapper: createWrapper() });
    result.current.mutate("session-456");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/admin/sessions/session-456/force-logout", expect.objectContaining({
      method: "POST",
    }));
  });
});
