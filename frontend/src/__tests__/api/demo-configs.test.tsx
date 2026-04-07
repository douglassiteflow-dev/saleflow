import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDemoConfigs, useDemoConfigDetail, useAdvanceDemoConfig, useRetryDemoConfig } from "@/api/demo-configs";

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDemoConfigs", () => {
  it("fetches demo configs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ demo_configs: [{ id: "dc-1", stage: "generating" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useDemoConfigs(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].stage).toBe("generating");
  });

  it("returns error on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useDemoConfigs(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});

describe("useDemoConfigDetail", () => {
  it("fetches detail for a specific config", async () => {
    const detail = {
      id: "dc-1",
      lead_id: "lead-1",
      user_id: "user-1",
      lead_name: "Acme AB",
      stage: "followup",
      source_url: "https://acme.se",
      preview_url: "https://preview.example.com/dc-1",
      notes: null,
      error: null,
      inserted_at: "2026-04-01T10:00:00Z",
      updated_at: "2026-04-01T10:00:00Z",
      lead: { id: "lead-1", company_name: "Acme AB", phone: "0701234567", email: "info@acme.se" },
      meetings: [],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ demo_config: detail }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useDemoConfigDetail("dc-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.id).toBe("dc-1");
    expect(result.current.data!.stage).toBe("followup");
    expect(result.current.data!.lead.company_name).toBe("Acme AB");
  });

  it("does not fetch when id is null", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => useDemoConfigDetail(null), { wrapper: createWrapper() });

    // Give it a tick to potentially fire
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("useAdvanceDemoConfig", () => {
  it("calls POST /api/demo-configs/:id/advance and invalidates queries", async () => {
    const advancedConfig = { id: "dc-1", stage: "followup" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ demo_config: advancedConfig }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useAdvanceDemoConfig(), { wrapper });

    await act(async () => {
      result.current.mutate("dc-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/demo-configs/dc-1/advance",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sets error state on mutation failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useAdvanceDemoConfig(), { wrapper });

    await act(async () => {
      result.current.mutate("dc-999");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useRetryDemoConfig", () => {
  it("calls POST /api/demo-configs/:id/retry and invalidates queries", async () => {
    const retriedConfig = { id: "dc-1", stage: "generating" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ demo_config: retriedConfig }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useRetryDemoConfig(), { wrapper });

    await act(async () => {
      result.current.mutate("dc-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/demo-configs/dc-1/retry",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sets error state on mutation failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useRetryDemoConfig(), { wrapper });

    await act(async () => {
      result.current.mutate("dc-1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
