import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";

interface SendContractParams {
  dealId: string;
  amount: number;
  terms?: string;
  recipientEmail?: string;
  recipientName?: string;
}

interface SendContractResult {
  contract: {
    id: string;
    contract_number: string;
    access_token: string;
    verification_code: string;
    status: string;
    recipient_email: string;
  };
}

export function useSendContract() {
  const queryClient = useQueryClient();

  return useMutation<SendContractResult, ApiError, SendContractParams>({
    mutationFn: ({ dealId, amount, terms, recipientEmail, recipientName }) =>
      api<SendContractResult>(`/api/deals/${dealId}/send-contract`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          terms,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
        }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["deals", "detail", variables.dealId] });
    },
  });
}
