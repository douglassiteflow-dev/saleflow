export type UserRole = "admin" | "agent";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type LeadStatus =
  | "new"
  | "assigned"
  | "callback"
  | "meeting_booked"
  | "quarantine"
  | "bad_number"
  | "customer"
  | "not_interested";

export type Outcome =
  | "meeting_booked"
  | "callback"
  | "not_interested"
  | "no_answer"
  | "bad_number"
  | "customer";

export interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  phone: string;
  email: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  assigned_user?: User | null;
  notes: string | null;
  priority: number;
  callback_at: string | null;
  do_not_call: boolean;
  list_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  lead_id: string;
  user_id: string;
  user?: User;
  outcome: Outcome | null;
  notes: string | null;
  duration_seconds: number | null;
  called_at: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  lead_id: string;
  user_id: string | null;
  user?: User | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  lead_id: string;
  lead?: Lead;
  user_id: string;
  user?: User;
  title: string;
  scheduled_at: string;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface Stats {
  calls_today: number;
  leads_remaining: number;
  meetings_booked: number;
  conversion_rate: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}
