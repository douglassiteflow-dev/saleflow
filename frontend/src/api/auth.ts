import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { User } from "./types";

export function useMe() {
  return useQuery<User | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await api<User>("/api/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

interface LoginParams {
  email: string;
  password: string;
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<User, ApiError, LoginParams>({
    mutationFn: (params) =>
      api<User>("/api/auth/sign-in", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: (user) => {
      queryClient.setQueryData(["auth", "me"], user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void>({
    mutationFn: () =>
      api<void>("/api/auth/sign-out", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
