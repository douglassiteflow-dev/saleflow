import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";

export interface Playbook {
  id: string;
  name: string;
  opening: string;
  pitch: string;
  objections: string;
  closing: string;
  guidelines: string;
  active: boolean;
}

export function usePlaybooks() {
  return useQuery<Playbook[]>({
    queryKey: ["playbooks"],
    queryFn: async () => {
      const data = await api<{ playbooks: Playbook[] }>("/api/admin/playbooks");
      return data.playbooks;
    },
  });
}

export function useCreatePlaybook() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; id: string }, ApiError, Partial<Playbook>>({
    mutationFn: (params) =>
      api("/api/admin/playbooks", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["playbooks"] }),
  });
}

export function useUpdatePlaybook() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, ApiError, Playbook>({
    mutationFn: ({ id, ...params }) =>
      api(`/api/admin/playbooks/${id}`, {
        method: "PUT",
        body: JSON.stringify(params),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["playbooks"] }),
  });
}

export function useDeletePlaybook() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, ApiError, string>({
    mutationFn: (id) =>
      api(`/api/admin/playbooks/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["playbooks"] }),
  });
}
