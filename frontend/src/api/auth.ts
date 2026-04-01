import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { User, LoginResponse, VerifyOtpResponse } from "./types";

export function useMe() {
  return useQuery<User | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const data = await api<{ user: User }>("/api/auth/me");
        return data.user;
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
  return useMutation<LoginResponse, ApiError, LoginParams>({
    mutationFn: (params) =>
      api<LoginResponse>("/api/auth/sign-in", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  });
}

interface VerifyOtpParams {
  user_id: string;
  code: string;
}

export function useVerifyOtp() {
  const queryClient = useQueryClient();

  return useMutation<VerifyOtpResponse, ApiError, VerifyOtpParams>({
    mutationFn: (params) =>
      api<VerifyOtpResponse>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth", "me"], data.user);
    },
  });
}

export function useResendOtp() {
  return useMutation<LoginResponse, ApiError, LoginParams>({
    mutationFn: (params) =>
      api<LoginResponse>("/api/auth/sign-in", {
        method: "POST",
        body: JSON.stringify(params),
      }),
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
