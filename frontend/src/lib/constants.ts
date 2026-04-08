import type { DealStage } from "@/api/types";

export const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Möte bokat",
  callback: "Återuppringning",
  not_interested: "Ej intresserad",
  no_answer: "Ej svar",
  call_later: "Ring senare",
  bad_number: "Fel nummer",
  customer: "Kund",
  other: "Övrigt",
};

export const OUTCOME_COLORS: Record<string, string> = {
  meeting_booked: "bg-emerald-100 text-emerald-700",
  callback: "bg-amber-100 text-amber-700",
  not_interested: "bg-rose-100 text-rose-700",
  no_answer: "bg-slate-100 text-slate-600",
  call_later: "bg-blue-100 text-blue-700",
  bad_number: "bg-red-100 text-red-700",
  customer: "bg-indigo-100 text-indigo-700",
  other: "bg-slate-100 text-slate-600",
};

export const STAGE_LABELS: Record<string, string> = {
  booking_wizard: "Bokning pågår",
  demo_scheduled: "Demo schemalagd",
  meeting_completed: "Möte genomfört",
  questionnaire_sent: "Formulär skickat",
  contract_sent: "Avtal skickat",
  won: "Kund",
  cancelled: "Avbruten",
};

export const PIPELINE_STAGES: { key: DealStage; label: string }[] = [
  { key: "booking_wizard", label: "Bokning pågår" },
  { key: "demo_scheduled", label: "Demo schemalagd" },
  { key: "meeting_completed", label: "Möte genomfört" },
  { key: "questionnaire_sent", label: "Formulär skickat" },
  { key: "contract_sent", label: "Avtal skickat" },
];
