import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMe, useLogin, useVerifyOtp, useResendOtp, useLogout } from "../auth";
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

describe("useMe", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns user data on success", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "1", email: "test@test.se", name: "Test", role: "agent" }),
    });

    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "1", email: "test@test.se", name: "Test", role: "agent" });
  });

  it("returns null on 401", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: () => Promise.resolve({ error: "Unauthorized" }),
    });

    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("throws on non-401 errors", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: () => Promise.resolve({ error: "Server down" }),
    });

    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useLogin", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends login request and returns LoginResponse", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ otp_sent: true, user_id: "u-123" }),
    });

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });
    result.current.mutate({ email: "test@test.se", password: "pass" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ otp_sent: true, user_id: "u-123" });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/sign-in", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("useVerifyOtp", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends verify-otp request", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { id: "1", email: "test@test.se", name: "Test", role: "agent" } }),
    });

    const { result } = renderHook(() => useVerifyOtp(), { wrapper: createWrapper() });
    result.current.mutate({ user_id: "u-123", code: "123456" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      user: { id: "1", email: "test@test.se", name: "Test", role: "agent" },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/verify-otp", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("useResendOtp", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("re-sends login request to get new OTP", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ otp_sent: true, user_id: "u-123" }),
    });

    const { result } = renderHook(() => useResendOtp(), { wrapper: createWrapper() });
    result.current.mutate({ email: "test@test.se", password: "pass" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/sign-in", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("useLogout", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends logout request", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(undefined),
    });

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/sign-out", expect.objectContaining({
      method: "POST",
    }));
  });
});
