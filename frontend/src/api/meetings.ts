import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { Meeting } from "./types";

export function useMeetings() {
  return useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api<Meeting[]>("/api/meetings"),
  });
}

export interface CreateMeetingParams {
  lead_id: string;
  title: string;
  scheduled_at: string;
  notes?: string;
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();

  return useMutation<Meeting, ApiError, CreateMeetingParams>({
    mutationFn: (params) =>
      api<Meeting>("/api/meetings", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useCancelMeeting() {
  const queryClient = useQueryClient();

  return useMutation<Meeting, ApiError, string>({
    mutationFn: (id) =>
      api<Meeting>(`/api/meetings/${id}/cancel`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
