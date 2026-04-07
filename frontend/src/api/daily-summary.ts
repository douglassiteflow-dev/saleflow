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

export interface DailyReport {
  headline: string;
  summary: string;
  wins: string[];
  improvements: string[];
  focus_tomorrow: string;
  agent_shoutouts: { agent: string; reason: string }[];
  trend_note: string;
}

export function useDailyReport(date: string) {
  return useQuery<{ date: string; report: DailyReport | null }>({
    queryKey: ["daily-report", date],
    queryFn: () => api<{ date: string; report: DailyReport | null }>(`/api/calls/daily-report?date=${date}`),
    staleTime: 60_000,
  });
}

/* ------------------------------------------------------------------ */
/*  Personal agent report (AI coach)                                   */
/* ------------------------------------------------------------------ */

export interface AgentReport {
  greeting: string;
  score_summary: string;
  highlights?: { type: "win" | "improve" | "observe"; text: string }[];
  checklist?: { task: string; source?: string }[];
  quote_of_the_day?: string;
  progress_note: string;
  motivation: string;
  // Legacy fields (backward compat)
  wins?: string[];
  focus_area?: string;
  tip_of_the_day?: string;
}

export interface AgentReportData {
  date: string;
  html: string | null;
  report: AgentReport | null;
  score_avg: number | null;
  call_count: number | null;
}

export function useAgentReport(date: string) {
  return useQuery<AgentReportData>({
    queryKey: ["agent-report", date],
    queryFn: () => api<AgentReportData>(`/api/calls/agent-report?date=${date}`),
    staleTime: 60_000,
  });
}
