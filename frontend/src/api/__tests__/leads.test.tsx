import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLeads, useLeadDetail, useNextLead, useSubmitOutcome } from "../leads";
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

const mockLead = {
  id: "1",
  företag: "Test AB",
  telefon: "+46701234567",
  epost: null,
  hemsida: null,
  adress: null,
  postnummer: null,
  stad: null,
  bransch: null,
  orgnr: null,
  omsättning_tkr: null,
  vinst_tkr: null,
  anställda: null,
  vd_namn: null,
  bolagsform: null,
  status: "new",
  quarantine_until: null,
  callback_at: null,
  callback_reminded_at: null,
  imported_at: null,
  inserted_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("useLeads", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("fetches all leads", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ leads: [mockLead] }),
    });

    const { result } = renderHook(() => useLeads(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockLead]);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/leads", expect.anything());
  });

  it("fetches leads with search query", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ leads: [] }),
    });

    const { result } = renderHook(() => useLeads("test"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/leads?q=test", expect.anything());
  });

  it("URL-encodes special characters in search query", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ leads: [] }),
    });

    const { result } = renderHook(() => useLeads("anna öberg"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/leads?q=anna%20%C3%B6berg",
      expect.anything(),
    );
  });

  it("fetches all leads when search is empty string", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ leads: [mockLead] }),
    });

    const { result } = renderHook(() => useLeads(""), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/leads", expect.anything());
  });
});

describe("useLeadDetail", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("fetches lead detail by id", async () => {
    const detail = { lead: mockLead, calls: [], audit_logs: [] };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(detail),
    });

    const { result } = renderHook(() => useLeadDetail("1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(detail);
  });

  it("is disabled when id is null", () => {
    const { result } = renderHook(() => useLeadDetail(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("is disabled when id is undefined", () => {
    const { result } = renderHook(() => useLeadDetail(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useNextLead", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("posts to /api/leads/next", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ lead: mockLead }),
    });

    const { result } = renderHook(() => useNextLead(), { wrapper: createWrapper() });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/leads/next", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("useSubmitOutcome", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("posts outcome to lead", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    const { result } = renderHook(() => useSubmitOutcome("1"), { wrapper: createWrapper() });
    result.current.mutate({ outcome: "no_answer" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/leads/1/outcome", expect.objectContaining({
      method: "POST",
    }));
  });
});
