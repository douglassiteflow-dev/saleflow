import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { LeadComment } from "./types";

export function useLeadComments(leadId: string | undefined) {
  return useQuery<LeadComment[]>({
    queryKey: ["leads", leadId, "comments"],
    queryFn: async () => {
      const data = await api<{ comments: LeadComment[] }>(`/api/leads/${leadId}/comments`);
      return data.comments;
    },
    enabled: !!leadId,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, text }: { leadId: string; text: string }) => {
      return api(`/api/leads/${leadId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
    },
    onSuccess: (_data, { leadId }) => {
      void qc.invalidateQueries({ queryKey: ["leads", leadId, "comments"] });
    },
  });
}
