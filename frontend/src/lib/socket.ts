import { Socket, Channel } from "phoenix";

let socket: Socket | null = null;
let callsChannel: Channel | null = null;
let dashboardChannel: Channel | null = null;

export function connectSocket(sessionToken: string) {
  if (socket?.isConnected()) return;
  socket = new Socket("/socket", { params: { token: sessionToken } });
  socket.connect();
}

export function joinCallsChannel(onLiveCalls: (calls: unknown[]) => void): Channel | null {
  if (!socket) return null;
  callsChannel = socket.channel("calls:live", {});
  callsChannel.join();
  callsChannel.on("live_calls", (payload: { calls: unknown[] }) => {
    onLiveCalls(payload.calls);
  });
  return callsChannel;
}

export function joinDashboardChannel(onUpdate: (payload: unknown) => void): Channel | null {
  if (!socket) return null;
  dashboardChannel = socket.channel("dashboard:updates", {});
  dashboardChannel.join();
  dashboardChannel.on("stats_updated", onUpdate);
  return dashboardChannel;
}

export function disconnectSocket() {
  callsChannel?.leave();
  dashboardChannel?.leave();
  socket?.disconnect();
  socket = null;
  callsChannel = null;
  dashboardChannel = null;
}
