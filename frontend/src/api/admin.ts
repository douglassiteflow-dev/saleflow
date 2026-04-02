import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload, ApiError } from "./client";
import type { User, Stats, ImportResult } from "./types";

export function useAdminStats() {
  return useQuery<Stats>({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const data = await api<{ stats: Stats }>("/api/admin/stats");
      return data.stats;
    },
  });
}

export function useAdminUsers() {
  return useQuery<User[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const data = await api<{ users: User[] }>("/api/admin/users");
      return data.users;
    },
  });
}

export interface CreateUserParams {
  email: string;
  name: string;
  password: string;
  password_confirmation: string;
  role: "admin" | "agent";
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation<User, ApiError, CreateUserParams>({
    mutationFn: async (params) => {
      const data = await api<{ user: User }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return data.user;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation<User, ApiError, { userId: string; phone_number?: string; extension_number?: string }>({
    mutationFn: async ({ userId, ...params }) => {
      const data = await api<{ user: User }>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(params),
      });
      return data.user;
    },
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
