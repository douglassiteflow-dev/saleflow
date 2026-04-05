import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { Deal, DealDetailData } from "./types";

export function useDeals() {
  return useQuery<Deal[]>({
    queryKey: ["deals"],
    queryFn: async () => {
      const data = await api<{ deals: Deal[] }>("/api/deals");
      return data.deals;
    },
    staleTime: 30_000,
  });
}

export function useDealDetail(id: string | null | undefined) {
  return useQuery<DealDetailData>({
    queryKey: ["deals", "detail", id],
    queryFn: async () => {
      const data = await api<DealDetailData>(`/api/deals/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useAdvanceDeal() {
  const queryClient = useQueryClient();

  return useMutation<Deal, ApiError, string>({
    mutationFn: (id) =>
      api<{ deal: Deal }>(`/api/deals/${id}/advance`, {
        method: "POST",
      }).then((r) => r.deal),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["deals", "detail", id] });
    },
  });
}

export interface UpdateDealParams {
  id: string;
  notes?: string;
  website_url?: string;
  contract_url?: string;
  domain?: string;
  domain_sponsored?: boolean;
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();

  return useMutation<Deal, ApiError, UpdateDealParams>({
    mutationFn: ({ id, ...params }) =>
      api<{ deal: Deal }>(`/api/deals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(params),
      }).then((r) => r.deal),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["deals", "detail", variables.id] });
    },
  });
}
