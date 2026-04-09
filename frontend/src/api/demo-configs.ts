import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { DemoConfig, DemoConfigDetail, Lead, Meeting, Questionnaire } from "./types";

export function useDemoConfigs() {
  return useQuery<DemoConfig[]>({
    queryKey: ["demo-configs"],
    queryFn: async () => {
      const data = await api<{ demo_configs: DemoConfig[] }>("/api/demo-configs");
      return data.demo_configs;
    },
    staleTime: 10_000,
  });
}

export function useDemoConfigDetail(id: string | null) {
  return useQuery<DemoConfigDetail>({
    queryKey: ["demo-configs", id],
    queryFn: async () => {
      const data = await api<{
        demo_config: DemoConfig;
        lead: Lead;
        meetings: Meeting[];
        questionnaire: Questionnaire | null;
      }>(`/api/demo-configs/${id}`);
      return {
        ...data.demo_config,
        lead: data.lead,
        meetings: data.meetings,
        questionnaire: data.questionnaire,
      };
    },
    enabled: !!id,
  });
}

export function useAdvanceDemoConfig() {
  const queryClient = useQueryClient();

  return useMutation<DemoConfig, ApiError, string>({
    mutationFn: (id) =>
      api<{ demo_config: DemoConfig }>(`/api/demo-configs/${id}/advance`, {
        method: "POST",
      }).then((r) => r.demo_config),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["demo-configs"] });
    },
  });
}

export function useRetryDemoConfig() {
  const queryClient = useQueryClient();

  return useMutation<DemoConfig, ApiError, string>({
    mutationFn: (id) =>
      api<{ demo_config: DemoConfig }>(`/api/demo-configs/${id}/retry`, {
        method: "POST",
      }).then((r) => r.demo_config),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["demo-configs"] });
    },
  });
}
