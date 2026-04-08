const API_BASE = import.meta.env.VITE_API_URL || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractData {
  id: string;
  contract_number: string;
  status: "draft" | "sent" | "viewed" | "signed" | "superseded" | "cancelled";
  amount: number;
  currency: string;
  terms: string | null;
  seller_name: string;
  seller_signed_at: string;
  recipient_name: string;
  recipient_email: string;
  customer_name: string | null;
  customer_signed_at: string | null;
  signed_pdf_url: string | null;
  access_token: string | null;
  expires_at: string | null;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ContractApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ContractApiError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Shared request helper
// ---------------------------------------------------------------------------

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
    throw new ContractApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

export async function fetchContract(token: string): Promise<ContractData> {
  return request<ContractData>(`/api/contracts/${token}`);
}

export async function verifyContract(token: string, code: string): Promise<ContractData> {
  return request<ContractData>(`/api/contracts/${token}/verify`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function signContract(
  token: string,
  params: { signature: string; customer_name: string; customer_email: string },
): Promise<{ signed: boolean; signed_at: string }> {
  return request<{ signed: boolean; signed_at: string }>(`/api/contracts/${token}/sign`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function downloadPdf(token: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/contracts/${token}/pdf`);
  if (!response.ok) {
    throw new ContractApiError(response.status, "Kunde inte ladda ner PDF");
  }
  return response.blob();
}

export async function updateTracking(
  token: string,
  data: { last_viewed_page: string; total_view_time: number; page_views: Record<string, number> },
): Promise<void> {
  // Fire-and-forget — we don't need the response
  await fetch(`${API_BASE}/api/contracts/${token}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
