import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { Contact } from "./types";

export function useContacts(leadId: string | null) {
  return useQuery<Contact[]>({
    queryKey: ["contacts", leadId],
    queryFn: async () => {
      const data = await api<{ contacts: Contact[] }>(`/api/leads/${leadId}/contacts`);
      return data.contacts;
    },
    enabled: !!leadId,
    staleTime: 30_000,
  });
}

export interface CreateContactParams {
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function useCreateContact(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation<Contact, ApiError, CreateContactParams>({
    mutationFn: async (params) => {
      const data = await api<{ contact: Contact }>(`/api/leads/${leadId}/contacts`, {
        method: "POST",
        body: JSON.stringify(params),
      });
      return data.contact;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts", leadId] });
    },
  });
}
