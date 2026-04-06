import { describe, it, expect, vi, beforeEach } from "vitest";

const joinMock = vi.fn();
const onMock = vi.fn();
const leaveMock = vi.fn();
const channelMock = { join: joinMock, on: onMock, leave: leaveMock };

const connectMock = vi.fn();
const disconnectMock = vi.fn();
const channelFactoryMock = vi.fn(() => channelMock);
const isConnectedMock = vi.fn(() => false);

vi.mock("phoenix", () => {
  // Use a real function so it works with `new`
  function MockSocket() {
    return {
      connect: connectMock,
      disconnect: disconnectMock,
      channel: channelFactoryMock,
      isConnected: isConnectedMock,
    };
  }
  return { Socket: MockSocket, Channel: vi.fn() };
});

// Must import after the mock is set up
let connectSocket: typeof import("../socket").connectSocket;
let joinCallsChannel: typeof import("../socket").joinCallsChannel;
let joinDashboardChannel: typeof import("../socket").joinDashboardChannel;
let disconnectSocket: typeof import("../socket").disconnectSocket;

describe("socket", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    isConnectedMock.mockReturnValue(false);
    // Re-import with fresh module state so the module-level `socket` variable resets
    vi.resetModules();
    const mod = await import("../socket");
    connectSocket = mod.connectSocket;
    joinCallsChannel = mod.joinCallsChannel;
    joinDashboardChannel = mod.joinDashboardChannel;
    disconnectSocket = mod.disconnectSocket;
  });

  it("connectSocket creates and connects a socket", () => {
    connectSocket("test-token");
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it("connectSocket is idempotent when already connected", () => {
    connectSocket("test-token");
    isConnectedMock.mockReturnValue(true);
    connectSocket("test-token");
    // connect only called once because the second call sees isConnected=true
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it("joinCallsChannel returns null when socket not connected", () => {
    const result = joinCallsChannel(vi.fn());
    expect(result).toBeNull();
  });

  it("joinDashboardChannel returns null when socket not connected", () => {
    const result = joinDashboardChannel(vi.fn());
    expect(result).toBeNull();
  });

  it("joinDashboardChannel joins and listens for stats_updated", () => {
    connectSocket("test-token");
    const callback = vi.fn();
    const channel = joinDashboardChannel(callback);

    expect(channel).toBe(channelMock);
    expect(channelFactoryMock).toHaveBeenCalledWith("dashboard:updates", {});
    expect(joinMock).toHaveBeenCalled();
    expect(onMock).toHaveBeenCalledWith("stats_updated", callback);
  });

  it("joinCallsChannel joins and listens for live_calls", () => {
    connectSocket("test-token");
    const callback = vi.fn();
    const channel = joinCallsChannel(callback);

    expect(channel).toBe(channelMock);
    expect(channelFactoryMock).toHaveBeenCalledWith("calls:live", {});
    expect(joinMock).toHaveBeenCalled();
    expect(onMock).toHaveBeenCalledWith("live_calls", expect.any(Function));
  });

  it("disconnectSocket cleans up channels and socket", () => {
    connectSocket("test-token");
    joinDashboardChannel(vi.fn());
    joinCallsChannel(vi.fn());
    disconnectSocket();

    expect(leaveMock).toHaveBeenCalledTimes(2);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });
});
