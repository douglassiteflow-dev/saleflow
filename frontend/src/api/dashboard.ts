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

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  calls_today: number;
  meetings_booked_today: number;
  meetings_cancelled_today: number;
  net_meetings_today: number;
}

export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ["dashboard", "leaderboard"],
    queryFn: async () => {
      const data = await api<{ leaderboard: LeaderboardEntry[] }>("/api/dashboard/leaderboard");
      return data.leaderboard;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}
