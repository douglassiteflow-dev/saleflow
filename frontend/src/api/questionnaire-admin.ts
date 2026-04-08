import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";

interface SendQuestionnaireParams {
  dealId: string;
  customerEmail?: string;
}

interface SendQuestionnaireResult {
  questionnaire: {
    id: string;
    token: string;
    status: string;
    customer_email: string;
  };
}

export function useSendQuestionnaire() {
  const queryClient = useQueryClient();

  return useMutation<SendQuestionnaireResult, ApiError, SendQuestionnaireParams>({
    mutationFn: ({ dealId, customerEmail }) =>
      api<SendQuestionnaireResult>(`/api/deals/${dealId}/send-questionnaire`, {
        method: "POST",
        body: JSON.stringify({ customer_email: customerEmail }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["deals", "detail", variables.dealId] });
    },
  });
}
