import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { TelavoxStatus, DialResponse, RecordingResponse } from "./types";

export function useTelavoxStatus() {
  return useQuery<TelavoxStatus>({
    queryKey: ["telavox", "status"],
    queryFn: () => api<TelavoxStatus>("/api/telavox/status"),
    staleTime: 60_000,
  });
}

export function useTelavoxConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api<TelavoxStatus>("/api/telavox/connect", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telavox", "status"] }),
  });
}

export function useTelavoxDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api("/api/telavox/disconnect", { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telavox", "status"] }),
  });
}

export function useDial() {
  return useMutation({
    mutationFn: (leadId: string) =>
      api<DialResponse>("/api/calls/dial", {
        method: "POST",
        body: JSON.stringify({ lead_id: leadId }),
      }),
  });
}

export function useHangup() {
  return useMutation({
    mutationFn: () =>
      api("/api/calls/hangup", { method: "POST" }),
  });
}

export function useRecordingUrl(phoneCallId: string | null) {
  return useQuery<RecordingResponse>({
    queryKey: ["recording", phoneCallId],
    queryFn: () => api<RecordingResponse>(`/api/calls/${phoneCallId}/recording`),
    enabled: !!phoneCallId,
    staleTime: 3600_000,
  });
}
