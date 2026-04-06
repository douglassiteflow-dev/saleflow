import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type {
  User,
  LoginResponse,
  LoginTrustedResponse,
  VerifyOtpResponse,
  ForgotPasswordResponse,
  ResetPasswordResponse,
} from "./types";

// Cached socket token from the last successful /api/auth/me call
let _socketToken: string | null = null;
export function getSocketToken() {
  return _socketToken;
}

export function useMe() {
  return useQuery<User | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const data = await api<{ user: User; socket_token: string }>("/api/auth/me");
        _socketToken = data.socket_token;
        return data.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          _socketToken = null;
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

export type SignInResponse = LoginResponse | LoginTrustedResponse;

function isLoginTrustedResponse(
  resp: SignInResponse,
): resp is LoginTrustedResponse {
  return "user" in resp;
}

export { isLoginTrustedResponse };

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<SignInResponse, ApiError, LoginParams>({
    mutationFn: (params) =>
      api<SignInResponse>("/api/auth/sign-in", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: (data) => {
      if (isLoginTrustedResponse(data)) {
        queryClient.setQueryData(["auth", "me"], data.user);
      }
    },
  });
}

interface VerifyOtpParams {
  user_id: string;
  code: string;
  remember_me?: boolean;
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

interface ForgotPasswordParams {
  email: string;
}

export function useForgotPassword() {
  return useMutation<ForgotPasswordResponse, ApiError, ForgotPasswordParams>({
    mutationFn: (params) =>
      api<ForgotPasswordResponse>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  });
}

interface ResetPasswordParams {
  token: string;
  password: string;
  password_confirmation: string;
}

export function useResetPassword() {
  return useMutation<ResetPasswordResponse, ApiError, ResetPasswordParams>({
    mutationFn: (params) =>
      api<ResetPasswordResponse>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  });
}
