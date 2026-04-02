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
  källa: string | null;
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
  user_name: string | null;
  outcome: Outcome;
  notes: string | null;
  called_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  changes: Record<string, { from: string; to: string }>;
  metadata: Record<string, string>;
  inserted_at: string;
}

export interface MeetingLead {
  id: string;
  företag: string;
  telefon: string;
  adress: string | null;
  postnummer: string | null;
  stad: string | null;
  bransch: string | null;
  omsättning_tkr: string | null;
  vd_namn: string | null;
  källa: string | null;
  status: LeadStatus;
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
  updated_at: string;
  inserted_at: string;
  user_name?: string | null;
  lead?: MeetingLead | null;
}

export interface MeetingDetailData {
  meeting: Meeting;
  lead: Lead;
  calls: CallLog[];
  audit_logs: AuditLog[];
}

export interface MyStats {
  calls_today: number;
  total_calls: number;
  meetings_today: number;
  total_meetings: number;
}

export interface DashboardData {
  stats: Stats;
  todays_meetings: Meeting[];
  callbacks: Lead[];
  my_stats: MyStats;
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

export interface UserRequest {
  id: string;
  user_id: string;
  user_name: string | null;
  type: "bug" | "feature";
  description: string;
  status: "new" | "in_progress" | "done" | "rejected";
  admin_notes: string | null;
  inserted_at: string;
  updated_at: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  list_id?: string;
}

export type LeadListStatus = "active" | "paused" | "completed";

export interface LeadList {
  id: string;
  name: string;
  description: string | null;
  total_count: number;
  status: LeadListStatus;
  imported_at: string | null;
  inserted_at: string;
  updated_at: string;
  stats?: LeadListStats;
}

export interface LeadListStats {
  total: number;
  new: number;
  assigned: number;
  meeting_booked: number;
  quarantine: number;
  customer: number;
  bad_number: number;
  callback: number;
}
