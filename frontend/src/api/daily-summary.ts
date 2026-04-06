import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

interface ScoreDetail {
  score: number;
  comment: string;
}

export interface CallAnalysis {
  analysis: {
    summary?: string;
    voicemail?: boolean;
    score?: {
      opening?: ScoreDetail;
      needs_discovery?: ScoreDetail;
      pitch?: ScoreDetail;
      objection_handling?: ScoreDetail;
      closing?: ScoreDetail;
      overall?: number;
      top_feedback?: string;
    };
    customer_needs?: string[];
    objections?: string[];
    positive_signals?: string[];
    conversation?: { speaker: string; text: string }[];
  };
  duration: number;
  outcome: string | null;
  agent: string | null;
}

export interface DailySummaryData {
  date: string;
  calls: CallAnalysis[];
}

export function useDailySummary(date: string) {
  return useQuery<DailySummaryData>({
    queryKey: ["daily-summary", date],
    queryFn: () => api<DailySummaryData>(`/api/calls/daily-summary?date=${date}`),
    staleTime: 60_000,
  });
}
