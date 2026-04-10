import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { Lead, CallLog } from "./types";

export interface OutcomeParams {
  outcome: string;
  notes?: string;
  duration?: number;
  title?: string;
  meeting_date?: string;
  meeting_time?: string;
  meeting_duration?: number;
  meeting_notes?: string;
  callback_at?: string;
  customer_email?: string;
  customer_name?: string;
  create_teams_meeting?: boolean;
  source_url?: string;
  source_type?: "bokadirekt" | "website" | "description";
  source_text?: string;
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
      // Invalidate any stale detail cache and let useLeadDetail refetch with full data (incl. calls)
      if (lead) {
        void queryClient.invalidateQueries({ queryKey: ["leads", "detail", lead.id] });
      }
    },
  });
}

export function useUpdateLead(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation<Lead, ApiError, { telefon_2?: string | null; epost?: string; hemsida?: string }>({
    mutationFn: async (params) => {
      const data = await api<{ lead: Lead }>(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify(params),
      });
      return data.lead;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads", "detail", leadId] });
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
      void queryClient.invalidateQueries({ queryKey: ["leads", "detail", leadId] });
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["callbacks"] });
      void queryClient.invalidateQueries({ queryKey: ["calls", "history"] });
    },
  });
}

export function useReactivateLead(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      await api<{ ok: boolean }>(`/api/leads/${leadId}/reactivate`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads", "detail", leadId] });
      void queryClient.invalidateQueries({ queryKey: ["leads", "list"] });
    },
  });
}

export function useCallbacks() {
  return useQuery<Lead[]>({
    queryKey: ["callbacks"],
    queryFn: async () => {
      const data = await api<{ callbacks: Lead[] }>("/api/callbacks");
      return data.callbacks;
    },
    refetchInterval: 30_000,
  });
}
