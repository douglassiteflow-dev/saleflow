import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { UserRequest } from "./types";

export interface CreateRequestParams {
  type: "bug" | "feature";
  description: string;
}

export interface UpdateRequestParams {
  status?: "new" | "in_progress" | "done" | "rejected";
  admin_notes?: string;
}

export function useRequests() {
  return useQuery<UserRequest[]>({
    queryKey: ["requests"],
    queryFn: async () => {
      const data = await api<{ requests: UserRequest[] }>("/api/requests");
      return data.requests;
    },
  });
}

export function useCreateRequest() {
  const queryClient = useQueryClient();

  return useMutation<UserRequest, ApiError, CreateRequestParams>({
    mutationFn: async (params) => {
      const data = await api<{ request: UserRequest }>("/api/requests", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return data.request;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
  });
}

export function useUpdateRequest() {
  const queryClient = useQueryClient();

  return useMutation<UserRequest, ApiError, { id: string } & UpdateRequestParams>({
    mutationFn: async ({ id, ...params }) => {
      const data = await api<{ request: UserRequest }>(`/api/admin/requests/${id}`, {
        method: "PUT",
        body: JSON.stringify(params),
      });
      return data.request;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
  });
}
