import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { LeadList, Lead, User } from "./types";

export function useLeadLists() {
  return useQuery<LeadList[]>({
    queryKey: ["admin", "lists"],
    queryFn: async () => {
      const data = await api<{ lists: LeadList[] }>("/api/admin/lists");
      return data.lists;
    },
  });
}

export function useLeadListDetail(id: string | null | undefined) {
  return useQuery<LeadList>({
    queryKey: ["admin", "lists", id],
    queryFn: async () => {
      const data = await api<{ list: LeadList }>(`/api/admin/lists/${id}`);
      return data.list;
    },
    enabled: !!id,
  });
}

export function useLeadListLeads(
  id: string | null | undefined,
  search?: string,
) {
  return useQuery<Lead[]>({
    queryKey: ["admin", "lists", id, "leads", search ?? ""],
    queryFn: async () => {
      const params = search ? `?q=${encodeURIComponent(search)}` : "";
      const data = await api<{ leads: Lead[] }>(
        `/api/admin/lists/${id}/leads${params}`,
      );
      return data.leads;
    },
    enabled: !!id,
  });
}

export function useLeadListAgents(id: string | null | undefined) {
  return useQuery<User[]>({
    queryKey: ["admin", "lists", id, "agents"],
    queryFn: async () => {
      const data = await api<{ agents: User[] }>(
        `/api/admin/lists/${id}/agents`,
      );
      return data.agents;
    },
    enabled: !!id,
  });
}

export function useAssignAgent() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { listId: string; userId: string }>({
    mutationFn: async ({ listId, userId }) => {
      await api(`/api/admin/lists/${listId}/agents`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "lists"] });
    },
  });
}

export function useRemoveAgent() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { listId: string; userId: string }>({
    mutationFn: async ({ listId, userId }) => {
      await api(`/api/admin/lists/${listId}/agents/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "lists"] });
    },
  });
}

export function useUpdateList() {
  const queryClient = useQueryClient();

  return useMutation<
    LeadList,
    ApiError,
    { id: string; name?: string; description?: string; status?: string }
  >({
    mutationFn: async ({ id, ...params }) => {
      const data = await api<{ list: LeadList }>(`/api/admin/lists/${id}`, {
        method: "PUT",
        body: JSON.stringify(params),
      });
      return data.list;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "lists"] });
    },
  });
}

export function useCreateList() {
  const queryClient = useQueryClient();

  return useMutation<
    LeadList,
    ApiError,
    { name: string; description?: string }
  >({
    mutationFn: async (params) => {
      const data = await api<{ list: LeadList }>("/api/admin/lists", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return data.list;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "lists"] });
    },
  });
}
