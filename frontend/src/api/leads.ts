import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { Lead } from "./types";

export interface OutcomeParams {
  outcome: string;
  notes?: string;
  title?: string;
  meeting_date?: string;
  meeting_time?: string;
  meeting_notes?: string;
  callback_at?: string;
}

export function useLeads(search?: string) {
  return useQuery<Lead[]>({
    queryKey: ["leads", "list", search ?? ""],
    queryFn: () => {
      const url = search
        ? `/api/leads?search=${encodeURIComponent(search)}`
        : "/api/leads";
      return api<Lead[]>(url);
    },
  });
}

export function useLeadDetail(id: string | null | undefined) {
  return useQuery<Lead>({
    queryKey: ["leads", "detail", id],
    queryFn: () => api<Lead>(`/api/leads/${id}`),
    enabled: !!id,
  });
}

export function useNextLead() {
  const queryClient = useQueryClient();

  return useMutation<Lead, ApiError, void>({
    mutationFn: () =>
      api<Lead>("/api/leads/next", {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useSubmitOutcome(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation<Lead, ApiError, OutcomeParams>({
    mutationFn: (params) =>
      api<Lead>(`/api/leads/${leadId}/outcome`, {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
