import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { CallSearchResult } from "./types";

export function useCallSearch(query: string, filters: Record<string, string>) {
  const params = new URLSearchParams({ q: query, ...filters });
  return useQuery<CallSearchResult[]>({
    queryKey: ["call-search", query, filters],
    queryFn: async () => {
      const data = await api<{ results: CallSearchResult[] }>(`/api/calls/search?${params}`);
      return data.results;
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}
