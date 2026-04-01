import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, apiUpload, ApiError } from "../client";

describe("ApiError", () => {
  it("creates error with status and message", () => {
    const err = new ApiError(404, "Not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.name).toBe("ApiError");
  });
});

describe("api", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("makes a GET request with credentials and JSON content-type", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: "test" }),
    });

    const result = await api("/api/test");
    expect(result).toEqual({ data: "test" });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/test", {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("passes additional options", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await api("/api/test", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/test", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("merges custom headers", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await api("/api/test", {
      headers: { "X-Custom": "value" },
    });

    // The spread ...options overrides headers with the original options.headers
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/test", {
      credentials: "include",
      headers: { "X-Custom": "value" },
    });
  });

  it("throws ApiError with error message from JSON body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () => Promise.resolve({ error: "Validation failed" }),
    });

    await expect(api("/api/test")).rejects.toThrow(ApiError);
    try {
      await api("/api/test");
    } catch (err) {
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).message).toBe("Validation failed");
    }
  });

  it("throws ApiError with message field from JSON body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable",
      json: () => Promise.resolve({ message: "Invalid data" }),
    });

    await expect(api("/api/test")).rejects.toThrow("Invalid data");
  });

  it("falls back to statusText when JSON parse fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("parse error")),
    });

    await expect(api("/api/test")).rejects.toThrow("Internal Server Error");
  });

  it("falls back to statusText when response has neither error nor message", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () => Promise.resolve({}),
    });

    await expect(api("/api/test")).rejects.toThrow("Bad Request");
  });
});

describe("apiUpload", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends FormData with POST method and credentials", async () => {
    const formData = new FormData();
    formData.append("file", "test");

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ imported: 5 }),
    });

    const result = await apiUpload("/api/upload", formData);
    expect(result).toEqual({ imported: 5 });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
  });

  it("throws ApiError on failure with error message", async () => {
    const formData = new FormData();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () => Promise.resolve({ error: "Invalid file" }),
    });

    await expect(apiUpload("/api/upload", formData)).rejects.toThrow("Invalid file");
  });

  it("falls back to statusText when JSON parse fails", async () => {
    const formData = new FormData();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: () => Promise.reject(new Error("parse error")),
    });

    await expect(apiUpload("/api/upload", formData)).rejects.toThrow("Server Error");
  });

  it("throws ApiError with message field from response", async () => {
    const formData = new FormData();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable",
      json: () => Promise.resolve({ message: "File too large" }),
    });

    await expect(apiUpload("/api/upload", formData)).rejects.toThrow("File too large");
  });

  it("falls back to statusText when neither error nor message in body", async () => {
    const formData = new FormData();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () => Promise.resolve({}),
    });

    await expect(apiUpload("/api/upload", formData)).rejects.toThrow("Bad Request");
  });
});
