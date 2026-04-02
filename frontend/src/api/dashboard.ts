import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { DashboardData } from "./types";

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const data = await api<DashboardData>("/api/dashboard");
      return data;
    },
    staleTime: 60_000,
  });
}
