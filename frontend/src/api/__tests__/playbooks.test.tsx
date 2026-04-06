import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  usePlaybooks,
  useCreatePlaybook,
  useUpdatePlaybook,
  useDeletePlaybook,
} from "../playbooks";
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

describe("usePlaybooks", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("fetches playbooks list", async () => {
    const playbooks = [
      { id: "1", name: "Test", opening: "a", pitch: "b", objections: "c", closing: "d", guidelines: "e", active: true },
    ];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ playbooks }),
    });

    const { result } = renderHook(() => usePlaybooks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(playbooks);
  });
});

describe("useCreatePlaybook", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("posts new playbook", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, id: "new-id" }),
    });

    const { result } = renderHook(() => useCreatePlaybook(), { wrapper: createWrapper() });
    result.current.mutate({ name: "New", opening: "", pitch: "", objections: "", closing: "", guidelines: "", active: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/admin/playbooks",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("useUpdatePlaybook", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("puts updated playbook", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    const { result } = renderHook(() => useUpdatePlaybook(), { wrapper: createWrapper() });
    result.current.mutate({
      id: "abc",
      name: "Updated",
      opening: "a",
      pitch: "b",
      objections: "c",
      closing: "d",
      guidelines: "e",
      active: true,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/admin/playbooks/abc",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});

describe("useDeletePlaybook", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("deletes playbook", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    const { result } = renderHook(() => useDeletePlaybook(), { wrapper: createWrapper() });
    result.current.mutate("abc");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/admin/playbooks/abc",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
