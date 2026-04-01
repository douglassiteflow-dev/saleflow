import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuditLogs } from "../audit";
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

const mockLog = {
  id: "a1",
  user_id: "u1",
  action: "lead.created",
  resource_type: "lead",
  resource_id: "l1",
  changes: {},
  metadata: {},
  inserted_at: "2024-01-01T00:00:00Z",
};

describe("useAuditLogs", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("fetches audit logs without filters", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audit_logs: [mockLog] }),
    });

    const { result } = renderHook(() => useAuditLogs(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockLog]);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/audit", expect.anything());
  });

  it("passes user_id filter", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audit_logs: [] }),
    });

    const { result } = renderHook(() => useAuditLogs({ user_id: "u1" }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/audit?user_id=u1", expect.anything());
  });

  it("passes action filter", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audit_logs: [] }),
    });

    const { result } = renderHook(() => useAuditLogs({ action: "lead.created" }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/audit?action=lead.created", expect.anything());
  });

  it("passes both filters", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audit_logs: [] }),
    });

    const { result } = renderHook(() => useAuditLogs({ user_id: "u1", action: "lead.created" }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("user_id=u1");
    expect(calledUrl).toContain("action=lead.created");
  });
});
