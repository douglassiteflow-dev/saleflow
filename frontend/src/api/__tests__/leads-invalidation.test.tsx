import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSubmitOutcome } from "../leads";
import type { ReactNode } from "react";

const originalFetch = globalThis.fetch;

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    qc,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

describe("useSubmitOutcome cache invalidations", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("invalidates lead detail, callbacks, and call history on success", async () => {
    const { qc, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    const { result } = renderHook(() => useSubmitOutcome("lead-123"), { wrapper: Wrapper });
    result.current.mutate({ outcome: "no_answer" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const invalidatedKeys = invalidateSpy.mock.calls.map(c => c[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(["leads", "detail", "lead-123"]);
    expect(invalidatedKeys).toContainEqual(["callbacks"]);
    expect(invalidatedKeys).toContainEqual(["calls", "history"]);
    expect(invalidatedKeys).toContainEqual(["leads", "list"]);
    expect(invalidatedKeys).toContainEqual(["meetings"]);
    expect(invalidatedKeys).toContainEqual(["dashboard"]);
  });
});
