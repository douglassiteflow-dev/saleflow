import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDashboardSync } from "../use-dashboard-sync";

// Capture the callback that joinDashboardChannel receives
let capturedCallback: ((payload: unknown) => void) | null = null;
const leaveMock = vi.fn();
const joinDashboardChannelMock = vi.fn((cb: (payload: unknown) => void) => {
  capturedCallback = cb;
  return { leave: leaveMock };
});

vi.mock("@/lib/socket", () => ({
  joinDashboardChannel: (...args: unknown[]) => joinDashboardChannelMock(...(args as [(payload: unknown) => void])),
}));

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

describe("useDashboardSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;
  });

  it("joins the dashboard channel on mount", () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useDashboardSync(), { wrapper: Wrapper });
    expect(joinDashboardChannelMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the dashboard channel on unmount", () => {
    const { Wrapper } = createWrapper();
    const { unmount } = renderHook(() => useDashboardSync(), { wrapper: Wrapper });
    unmount();
    expect(leaveMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates queries when callback is invoked", () => {
    const { qc, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useDashboardSync(), { wrapper: Wrapper });

    expect(capturedCallback).not.toBeNull();
    capturedCallback!({ event: "meeting_created" });

    // Should invalidate dashboard, calls history, leaderboard, meetings, deals
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["calls", "history"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard", "leaderboard"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["meetings"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["deals"] });
  });
});
