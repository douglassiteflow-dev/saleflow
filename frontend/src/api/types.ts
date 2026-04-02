export type UserRole = "admin" | "agent";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginResponse {
  otp_sent: boolean;
  user_id: string;
}

export interface LoginTrustedResponse {
  user: User;
}

export interface VerifyOtpResponse {
  user: User;
}

export interface ForgotPasswordResponse {
  ok: boolean;
}

export interface ResetPasswordResponse {
  ok: boolean;
}

export interface LoginSession {
  id: string;
  device_type: string;
  browser: string;
  city: string | null;
  country: string | null;
  logged_in_at: string;
  last_active_at: string;
  force_logged_out: boolean;
  current: boolean;
}

export type LeadStatus =
  | "new"
  | "assigned"
  | "callback"
  | "meeting_booked"
  | "quarantine"
  | "bad_number"
  | "customer";

export type Outcome =
  | "meeting_booked"
  | "callback"
  | "not_interested"
  | "no_answer"
  | "bad_number"
  | "customer";

export interface Lead {
  id: string;
  företag: string;
  telefon: string;
  epost: string | null;
  hemsida: string | null;
  adress: string | null;
  postnummer: string | null;
  stad: string | null;
  bransch: string | null;
  orgnr: string | null;
  omsättning_tkr: string | null;
  vinst_tkr: string | null;
  anställda: string | null;
  vd_namn: string | null;
  bolagsform: string | null;
  status: LeadStatus;
  quarantine_until: string | null;
  callback_at: string | null;
  callback_reminded_at: string | null;
  imported_at: string | null;
  inserted_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  lead_id: string;
  user_id: string;
  outcome: Outcome;
  notes: string | null;
  called_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  changes: Record<string, { from: string; to: string }>;
  metadata: Record<string, string>;
  inserted_at: string;
}

export interface Meeting {
  id: string;
  lead_id: string;
  user_id: string;
  title: string;
  meeting_date: string;
  meeting_time: string;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
  reminded_at: string | null;
  inserted_at: string;
}

export interface Stats {
  total_leads: number;
  new: number;
  assigned: number;
  meeting_booked: number;
  quarantine: number;
  customer: number;
  bad_number: number;
}

export interface ImportResult {
  created: number;
  skipped: number;
}
