import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Goal } from "./types";

export function useGoals() {
  return useQuery<Goal[]>({
    queryKey: ["goals"],
    queryFn: async () => {
      const data = await api<{ goals: Goal[] }>("/api/goals");
      return data.goals;
    },
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      scope: string;
      metric: string;
      target_value: number;
      period: string;
      user_id?: string;
    }) => {
      return api<{ goal: Goal }>("/api/goals", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      goalId,
      target_value,
    }: {
      goalId: string;
      target_value: number;
    }) => {
      return api<{ goal: Goal }>(`/api/goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify({ target_value }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goalId: string) => {
      return api<{ ok: boolean }>(`/api/goals/${goalId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
