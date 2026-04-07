import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { Meeting, MeetingDetailData } from "./types";

export function useMeetings() {
  return useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: async () => {
      const data = await api<{ meetings: Meeting[] }>("/api/meetings");
      return data.meetings;
    },
    staleTime: 60_000,
  });
}

export function useMeetingDetail(id: string | null | undefined) {
  return useQuery<MeetingDetailData>({
    queryKey: ["meetings", "detail", id],
    queryFn: async () => {
      const data = await api<MeetingDetailData>(`/api/meetings/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export interface CreateMeetingParams {
  lead_id: string;
  title: string;
  meeting_date: string;
  meeting_time: string;
  notes?: string;
  source_url?: string;
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

export interface UpdateMeetingParams {
  id: string;
  meeting_date?: string;
  meeting_time?: string;
  notes?: string;
  status?: "scheduled" | "completed" | "cancelled";
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();

  return useMutation<Meeting, ApiError, UpdateMeetingParams>({
    mutationFn: ({ id, ...params }) =>
      api<{ meeting: Meeting }>(`/api/meetings/${id}`, {
        method: "PUT",
        body: JSON.stringify(params),
      }).then((r) => r.meeting),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings", "detail", variables.id] });
    },
  });
}

export function useCancelMeeting() {
  const queryClient = useQueryClient();

  return useMutation<Meeting, ApiError, string>({
    mutationFn: (id) =>
      api<{ meeting: Meeting }>(`/api/meetings/${id}/cancel`, {
        method: "POST",
      }).then((r) => r.meeting),
    onMutate: async (id) => {
      // Optimistic cancel: remove from meetings cache
      await queryClient.cancelQueries({ queryKey: ["meetings"] });
      const previousMeetings = queryClient.getQueryData<Meeting[]>(["meetings"]);

      if (previousMeetings) {
        queryClient.setQueryData<Meeting[]>(
          ["meetings"],
          previousMeetings.map((m) =>
            m.id === id ? { ...m, status: "cancelled" as const } : m,
          ),
        );
      }

      return { previousMeetings };
    },
    onError: (_err, _id, context) => {
      // Revert on error
      const ctx = context as { previousMeetings?: Meeting[] } | undefined;
      if (ctx?.previousMeetings) {
        queryClient.setQueryData(["meetings"], ctx.previousMeetings);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
