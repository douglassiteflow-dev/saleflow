import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { Lead, CallLog, AuditLog } from "./types";

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
    queryFn: async () => {
      const params = search ? `?q=${encodeURIComponent(search)}` : "";
      const data = await api<{ leads: Lead[] }>(`/api/leads${params}`);
      return data.leads;
    },
  });
}

export interface LeadDetailData {
  lead: Lead;
  calls: CallLog[];
  audit_logs: AuditLog[];
}

export function useLeadDetail(id: string | null | undefined) {
  return useQuery<LeadDetailData>({
    queryKey: ["leads", "detail", id],
    queryFn: async () => {
      const data = await api<LeadDetailData>(`/api/leads/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useNextLead() {
  const queryClient = useQueryClient();

  return useMutation<Lead | null, ApiError, void>({
    mutationFn: async () => {
      const data = await api<{ lead: Lead | null }>("/api/leads/next", {
        method: "POST",
      });
      return data.lead;
    },
    onSuccess: (lead) => {
      void queryClient.invalidateQueries({ queryKey: ["leads", "list"] });
      // Pre-populate lead detail cache from next-lead response
      if (lead) {
        queryClient.setQueryData(["leads", "detail", lead.id], { lead, calls: [], audit_logs: [] });
      }
    },
  });
}

export function useSubmitOutcome(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, OutcomeParams>({
    mutationFn: async (params) => {
      await api<{ ok: boolean }>(`/api/leads/${leadId}/outcome`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
