import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { CallHistoryEntry } from "./types";

export function useCallHistory(from: string, to: string) {
  return useQuery<CallHistoryEntry[]>({
    queryKey: ["calls", "history", from, to],
    queryFn: async () => {
      const data = await api<{ calls: CallHistoryEntry[] }>(
        `/api/calls/history?from=${from}&to=${to}`,
      );
      return data.calls;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
