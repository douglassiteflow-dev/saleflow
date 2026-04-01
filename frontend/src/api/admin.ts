import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload, ApiError } from "./client";
import type { User, Stats, ImportResult } from "./types";

export function useAdminStats() {
  return useQuery<Stats>({
    queryKey: ["admin", "stats"],
    queryFn: () => api<Stats>("/api/admin/stats"),
  });
}

export function useAdminUsers() {
  return useQuery<User[]>({
    queryKey: ["admin", "users"],
    queryFn: () => api<User[]>("/api/admin/users"),
  });
}

export interface CreateUserParams {
  email: string;
  name: string;
  password: string;
  role: "admin" | "agent";
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation<User, ApiError, CreateUserParams>({
    mutationFn: (params) =>
      api<User>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useImportLeads() {
  const queryClient = useQueryClient();

  return useMutation<ImportResult, ApiError, FormData>({
    mutationFn: (formData) => apiUpload<ImportResult>("/api/admin/import", formData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
