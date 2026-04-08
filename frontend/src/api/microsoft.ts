import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { MicrosoftStatus } from "./types";

export function useMicrosoftStatus() {
  return useQuery<MicrosoftStatus>({
    queryKey: ["microsoft", "status"],
    queryFn: () => api<MicrosoftStatus>("/api/microsoft/status"),
    staleTime: 60_000,
  });
}

export function useMicrosoftAuthorize() {
  return useMutation<{ url: string }, ApiError, void>({
    mutationFn: () => api<{ url: string }>("/api/auth/microsoft"),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
}

export function useMicrosoftDisconnect() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean }, ApiError, void>({
    mutationFn: () =>
      api<{ ok: boolean }>("/api/microsoft/disconnect", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["microsoft", "status"] });
    },
  });
}

export interface CreateTeamsMeetingParams {
  meetingId: string;
  email?: string;
  name?: string;
}

export function useCreateTeamsMeeting() {
  const queryClient = useQueryClient();

  return useMutation<
    { ok: boolean; teams_join_url: string; teams_event_id: string },
    ApiError,
    CreateTeamsMeetingParams
  >({
    mutationFn: ({ meetingId, email, name }) =>
      api<{ ok: boolean; teams_join_url: string; teams_event_id: string }>(
        `/api/meetings/${meetingId}/create-teams-meeting`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(email ? { email } : {}),
            ...(name ? { name } : {}),
          }),
        },
      ),
    onSuccess: (_data, { meetingId }) => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      void queryClient.invalidateQueries({
        queryKey: ["meetings", "detail", meetingId],
      });
    },
  });
}
