import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { CallHistoryEntry } from "./types";

export function useCallHistory(date: string) {
  return useQuery<CallHistoryEntry[]>({
    queryKey: ["calls", "history", date],
    queryFn: async () => {
      const data = await api<{ calls: CallHistoryEntry[] }>(
        `/api/calls/history?date=${date}`,
      );
      return data.calls;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
