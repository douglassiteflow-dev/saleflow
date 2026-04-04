import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { AppInfo, AgentPermission } from "./types";

export function useMyApps() {
  return useQuery<AppInfo[]>({
    queryKey: ["apps", "my"],
    queryFn: async () => {
      const data = await api<{ apps: AppInfo[] }>("/api/apps");
      return data.apps;
    },
    staleTime: 60_000,
  });
}

export function useAdminApps() {
  return useQuery<AppInfo[]>({
    queryKey: ["admin", "apps"],
    queryFn: async () => {
      const data = await api<{ apps: AppInfo[] }>("/api/admin/apps");
      return data.apps;
    },
  });
}

export function useAdminAppDetail(slug: string | undefined) {
  return useQuery<{ app: AppInfo; agents: AgentPermission[] }>({
    queryKey: ["admin", "apps", slug],
    queryFn: async () => {
      return api<{ app: AppInfo; agents: AgentPermission[] }>(`/api/admin/apps/${slug}`);
    },
    enabled: !!slug,
  });
}

export function useToggleApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      return api<{ app: AppInfo }>(`/api/admin/apps/${slug}/toggle`, { method: "POST" });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "apps"] });
      void qc.invalidateQueries({ queryKey: ["apps", "my"] });
    },
  });
}

export function useAddPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, userId }: { slug: string; userId: string }) => {
      return api(`/api/admin/apps/${slug}/permissions`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "apps"] });
    },
  });
}

export function useRemovePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, userId }: { slug: string; userId: string }) => {
      return api(`/api/admin/apps/${slug}/permissions/${userId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "apps"] });
    },
  });
}
