import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { LoginSession } from "./types";

export function useMySessions() {
  return useQuery<LoginSession[]>({
    queryKey: ["auth", "sessions"],
    queryFn: async () => {
      const data = await api<{ sessions: LoginSession[] }>("/api/auth/sessions");
      return data.sessions;
    },
  });
}

export function useLogoutAll() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void>({
    mutationFn: () =>
      api<void>("/api/auth/sessions/logout-all", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useUserSessions(userId: string) {
  return useQuery<LoginSession[]>({
    queryKey: ["admin", "users", userId, "sessions"],
    queryFn: async () => {
      const data = await api<{ sessions: LoginSession[] }>(
        `/api/admin/users/${userId}/sessions`,
      );
      return data.sessions;
    },
    enabled: !!userId,
  });
}

export function useForceLogoutUser() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (userId) =>
      api<void>(`/api/admin/users/${userId}/force-logout`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useForceLogoutSession() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (sessionId) =>
      api<void>(`/api/admin/sessions/${sessionId}/force-logout`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
  });
}
