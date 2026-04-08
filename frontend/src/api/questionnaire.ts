const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export interface QuestionnaireData {
  id: string;
  deal_id: string | null;
  token: string;
  status: "pending" | "in_progress" | "completed";
  customer_email: string;
  capacity: string | null;
  color_theme: string | null;
  services_text: string | null;
  services_file_url: string | null;
  custom_changes: string | null;
  wants_ads: boolean | null;
  most_profitable_service: string | null;
  wants_quote_generator: boolean | null;
  addon_services: string[];
  media_urls: string[];
  completed_at: string | null;
}

class QuestionnaireApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "QuestionnaireApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  const { headers: _, ...restOptions } = options ?? {};
  const response = await fetch(`${API_BASE}${path}`, {
    headers: mergedHeaders,
    ...restOptions,
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // ignore parse errors
    }
    throw new QuestionnaireApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

export async function fetchQuestionnaire(token: string): Promise<QuestionnaireData> {
  return request<{ questionnaire: QuestionnaireData }>(`/q/${token}`).then(
    (r) => r.questionnaire,
  );
}

export async function saveAnswers(
  token: string,
  answers: Partial<QuestionnaireData>,
): Promise<QuestionnaireData> {
  return request<{ questionnaire: QuestionnaireData }>(`/q/${token}`, {
    method: "PATCH",
    body: JSON.stringify(answers),
  }).then((r) => r.questionnaire);
}

export async function completeQuestionnaire(token: string): Promise<QuestionnaireData> {
  return request<{ questionnaire: QuestionnaireData }>(`/q/${token}/complete`, {
    method: "POST",
  }).then((r) => r.questionnaire);
}

export async function uploadMedia(token: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/q/${token}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // ignore
    }
    throw new QuestionnaireApiError(response.status, message);
  }

  const data = (await response.json()) as { url: string };
  return data.url;
}
