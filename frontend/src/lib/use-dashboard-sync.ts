import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { joinDashboardChannel } from "@/lib/socket";
import type { Channel } from "phoenix";

/**
 * Joins the dashboard:updates WebSocket channel and invalidates
 * relevant React Query caches when the server pushes a stats_updated event.
 *
 * Should be rendered once inside an authenticated route wrapper.
 */
export function useDashboardSync() {
  const queryClient = useQueryClient();
  const channelRef = useRef<Channel | null>(null);

  useEffect(() => {
    channelRef.current = joinDashboardChannel(() => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["calls", "history"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "leaderboard"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
    });

    return () => {
      channelRef.current?.leave();
      channelRef.current = null;
    };
  }, [queryClient]);
}
