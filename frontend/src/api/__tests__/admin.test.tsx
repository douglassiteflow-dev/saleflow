import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAdminStats, useAdminUsers, useCreateUser, useImportLeads } from "../admin";
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

describe("useAdminStats", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("fetches admin stats", async () => {
    const stats = { calls_today: 5, leads_remaining: 10, meetings_booked: 3, conversion_rate: 0.15 };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(stats),
    });

    const { result } = renderHook(() => useAdminStats(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(stats);
  });
});

describe("useAdminUsers", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("fetches all users", async () => {
    const users = [{ id: "1", email: "a@b.se", name: "A", role: "admin", active: true }];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(users),
    });

    const { result } = renderHook(() => useAdminUsers(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(users);
  });
});

describe("useCreateUser", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("posts new user", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "2", email: "new@test.se", name: "New", role: "agent" }),
    });

    const { result } = renderHook(() => useCreateUser(), { wrapper: createWrapper() });
    result.current.mutate({ email: "new@test.se", name: "New", password: "pass123", role: "agent" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("useImportLeads", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("uploads form data", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ imported: 10, skipped: 2, errors: [] }),
    });

    const formData = new FormData();
    const { result } = renderHook(() => useImportLeads(), { wrapper: createWrapper() });
    result.current.mutate(formData);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/admin/import", expect.objectContaining({
      method: "POST",
    }));
  });
});
