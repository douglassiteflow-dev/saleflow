import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { AuditLog } from "./types";

export function useAuditLogs(filters?: { user_id?: string; action?: string }) {
  const params = new URLSearchParams();
  if (filters?.user_id) params.set("user_id", filters.user_id);
  if (filters?.action) params.set("action", filters.action);
  const qs = params.toString();

  return useQuery({
    queryKey: ["audit", filters],
    queryFn: async () => {
      const data = await api<{ audit_logs: AuditLog[] }>(`/api/audit${qs ? `?${qs}` : ""}`);
      return data.audit_logs;
    },
  });
}
