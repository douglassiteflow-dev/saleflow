import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { DemoConfig, Meeting, Questionnaire } from "./types";

export type FollowupLanguage = "sv" | "en";

export interface FollowupPreview {
  subject: string;
  html: string;
}

export interface PreviewFollowupInput {
  meeting_date: string;
  meeting_time: string;
  personal_message: string;
  language: FollowupLanguage;
}

export interface BookFollowupInput extends PreviewFollowupInput {
  id: string;
  email: string;
  send_copy: boolean;
}

export interface BookFollowupResult {
  demo_config: DemoConfig;
  meeting: Meeting;
  questionnaire: Questionnaire;
}

export function usePreviewFollowupMail(
  demoConfigId: string | null,
  params: PreviewFollowupInput,
) {
  const enabled = !!demoConfigId && !!params.meeting_date && !!params.meeting_time;
  const query = new URLSearchParams({
    meeting_date: params.meeting_date,
    meeting_time: params.meeting_time,
    personal_message: params.personal_message,
    language: params.language,
  }).toString();

  return useQuery<FollowupPreview>({
    queryKey: ["followup-preview", demoConfigId, params],
    queryFn: () =>
      api<FollowupPreview>(`/api/demo-configs/${demoConfigId}/followup-preview?${query}`),
    enabled,
    staleTime: 5_000,
  });
}

export function useBookFollowup() {
  const queryClient = useQueryClient();

  return useMutation<BookFollowupResult, ApiError, BookFollowupInput>({
    mutationFn: ({ id, ...body }) =>
      api<BookFollowupResult>(`/api/demo-configs/${id}/book-followup`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["demo-configs"] });
    },
  });
}
