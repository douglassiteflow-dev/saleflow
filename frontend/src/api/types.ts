export type UserRole = "admin" | "agent";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone_number: string | null;
  extension_number: string | null;
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
  | "call_later"
  | "bad_number"
  | "customer";

export interface Lead {
  id: string;
  företag: string;
  telefon: string;
  telefon_2: string | null;
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
  duration: number;
  has_recording: boolean;
  phone_call_id?: string | null;
  transcription?: string | null;
  transcription_analysis?: string | null;
}

export interface CallHistoryEntry {
  id: string;
  called_at: string;
  outcome: string | null;
  notes: string | null;
  user_id: string | null;
  user_name: string | null;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  duration: number;
  has_recording: boolean;
  phone_call_id: string | null;
  transcription: string | null;
  transcription_analysis: string | null;
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
  epost: string | null;
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
  duration_minutes: number;
  status: "scheduled" | "completed" | "cancelled";
  reminded_at: string | null;
  teams_join_url: string | null;
  teams_event_id: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  updated_at: string;
  inserted_at: string;
  user_name?: string | null;
  lead?: MeetingLead | null;
  demo_config_id?: string | null;
}

export interface MicrosoftStatus {
  connected: boolean;
  email?: string;
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

export interface ConversionData {
  calls_today: number;
  meetings_today: number;
  rate: number;
}

export type GoalScope = "global" | "team" | "personal";
export type GoalMetric = "meetings_per_week" | "calls_per_day";
export type GoalPeriod = "daily" | "weekly";

export interface Goal {
  id: string;
  scope: GoalScope;
  metric: GoalMetric;
  target_value: number;
  user_id: string | null;
  set_by_id: string;
  active: boolean;
  period: GoalPeriod;
  inserted_at: string;
  updated_at: string;
}

export interface GoalProgress {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target_value: number;
  current_value: number;
  scope: GoalScope;
}

export interface DashboardData {
  stats: Stats;
  todays_meetings: Meeting[];
  callbacks: Lead[];
  my_stats: MyStats;
  conversion: ConversionData;
  goal_progress: GoalProgress[];
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

export interface TelavoxStatus {
  connected: boolean;
  expired?: boolean;
  extension?: string;
  name?: string;
}

export interface LiveCall {
  user_id: string | null;
  agent_name: string;
  extension: string;
  callerid: string;
  direction: "in" | "out" | "unknown";
  linestatus: "up" | "down" | "ringing";
}

export interface DialResponse {
  ok: boolean;
  number?: string;
}

export interface RecordingResponse {
  url: string;
}

export interface AppInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  long_description: string | null;
  icon: string | null;
  active: boolean;
  agent_count?: number;
}

export interface AgentPermission {
  user_id: string;
  name: string;
  has_access: boolean;
}

export interface LeadComment {
  id: string;
  lead_id: string;
  user_id: string;
  user_name: string;
  text: string;
  inserted_at: string;
}

export interface AppNotification {
  id: string;
  type: "meeting_soon" | "meeting_update" | "callback_due" | "goal_reached";
  title: string;
  body: string | null;
  resource_type: string | null;
  resource_id: string | null;
  read_at: string | null;
  inserted_at: string;
}

export type DealStage =
  | "booking_wizard"
  | "demo_scheduled"
  | "meeting_completed"
  | "questionnaire_sent"
  | "contract_sent"
  | "won"
  | "cancelled";

export interface Deal {
  id: string;
  lead_id: string;
  user_id: string;
  stage: DealStage;
  website_url: string | null;
  domain: string | null;
  domain_sponsored: boolean;
  notes: string | null;
  meeting_outcome: string | null;
  needs_followup: boolean;
  lead_name: string | null;
  user_name: string | null;
  inserted_at: string;
  updated_at: string;
}

export interface DealDetailData {
  deal: Deal;
  lead: Lead;
  meetings: Meeting[];
  audit_logs: AuditLog[];
}

export interface Contact {
  id: string;
  lead_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

export type DemoStage =
  | "meeting_booked"
  | "generating"
  | "demo_ready"
  | "followup"
  | "cancelled";

export interface DemoConfig {
  id: string;
  lead_id: string;
  user_id: string;
  lead_name: string | null;
  stage: DemoStage;
  source_url: string | null;
  preview_url: string | null;
  notes: string | null;
  error: string | null;
  health_score: number | null;
  inserted_at: string;
  updated_at: string;
}

export interface DemoConfigDetail extends DemoConfig {
  lead: Lead;
  meetings: Meeting[];
}

export interface ScorecardQuestion {
  score: number;
  comment: string;
}

export interface ScorecardCategory {
  [question: string]: ScorecardQuestion | number;
  avg: number;
}

export interface Scorecard {
  opening: ScorecardCategory;
  discovery: ScorecardCategory;
  pitch: ScorecardCategory;
  objection_handling: ScorecardCategory;
  closing: ScorecardCategory;
  overall_avg: number;
}

export interface TalkRatio {
  seller_pct: number;
  customer_pct: number;
  longest_monolog_seconds: number;
  avg_seller_turn_seconds: number;
  avg_customer_turn_seconds: number;
}

export interface SentimentAnalysis {
  overall: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
}

export interface CallSearchResult {
  id: string;
  received_at: string;
  duration: number;
  scorecard_avg: number | null;
  sentiment: string | null;
  summary: string | null;
  outcome: string | null;
  agent_name: string | null;
  snippet: string;
}
